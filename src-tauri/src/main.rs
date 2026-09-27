#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs::{self, File},
    io::{BufRead, BufReader},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    webview::NewWindowResponse,
    Manager, WebviewUrl, WebviewWindowBuilder,
};

struct Backend {
    child: Child,
    closing: Arc<AtomicBool>,
}

impl Drop for Backend {
    fn drop(&mut self) {
        self.closing.store(true, Ordering::SeqCst);
        // EOF asks Node to drain its queue and close SQLite; it also works on parent crashes.
        drop(self.child.stdin.take());
        let deadline = Instant::now() + Duration::from_secs(6);
        while Instant::now() < deadline {
            if !matches!(self.child.try_wait(), Ok(None)) {
                return;
            }
            thread::sleep(Duration::from_millis(40));
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn error_dialog(message: &str) {
    rfd::MessageDialog::new()
        .set_title("Daily Signal")
        .set_description(message)
        .set_level(rfd::MessageLevel::Error)
        .show();
}

fn start_backend(app: &tauri::App) -> Result<(Backend, tauri::Url), Box<dyn std::error::Error>> {
    let data = match std::env::var_os("DAILY_SIGNAL_DATA_DIR") {
        Some(path) => PathBuf::from(path),
        None => app.path().app_data_dir()?,
    };
    fs::create_dir_all(&data)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&data, fs::Permissions::from_mode(0o700))?;
    }
    let resources = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../.desktop/resources")
    } else {
        app.path().resource_dir()?.join("backend")
    };
    let node = std::env::current_exe()?
        .parent()
        .ok_or("无法找到应用目录")?
        .join("daily-signal-node");
    let log = File::create(data.join("desktop-backend.log"))?;
    let child = Command::new(node)
        .arg(resources.join("server.mjs"))
        .current_dir(&data)
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .env("NODE_ENV", "production")
        .env("DAILY_SIGNAL_DESKTOP", "1")
        .env("DAILY_SIGNAL_RESOURCES", &resources)
        .env("DATABASE_PATH", data.join("daily-signal.sqlite"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::from(log))
        .spawn()?;
    let closing = Arc::new(AtomicBool::new(false));
    let mut backend = Backend {
        child,
        closing: closing.clone(),
    };
    let stdout = backend.child.stdout.take().ok_or("无法连接本地服务")?;
    let (tx, rx) = mpsc::channel();
    let handle = app.handle().clone();
    thread::spawn(move || {
        let mut ready = false;
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else {
                break;
            };
            if !ready {
                if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                    if value["event"] == "ready" {
                        if let Some(url) = value["url"].as_str() {
                            ready = tx.send(url.to_owned()).is_ok();
                        }
                    }
                }
            }
        }
        if ready && !closing.load(Ordering::SeqCst) {
            let exit_handle = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                error_dialog("本地服务意外停止，请退出后重新打开应用。日志位于应用数据目录的 desktop-backend.log。");
                exit_handle.exit(1);
            });
        }
    });
    let address = rx
        .recv_timeout(Duration::from_secs(20))
        .map_err(|_| "本地服务未能启动。请查看应用数据目录的 desktop-backend.log。")?;
    let url: tauri::Url = address.parse()?;
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") || url.port().is_none() {
        return Err("本地服务返回了无效地址".into());
    }
    Ok((backend, url))
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn open_external(url: &tauri::Url) {
    if matches!(url.scheme(), "http" | "https")
        && url.username().is_empty()
        && url.password().is_none()
    {
        let _ = open::that(url.as_str());
    }
}

fn main() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            show_main(app)
        }))
        .setup(|app| {
            let (backend, url) = start_backend(app)?;
            app.manage(Mutex::new(Some(backend)));
            let origin = url.origin();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("Daily Signal")
                .inner_size(1280.0, 860.0)
                .min_inner_size(760.0, 560.0)
                .on_navigation(move |target| {
                    if target.origin() == origin {
                        return true;
                    }
                    // Blob downloads stay within WebKit; all web links open in the browser.
                    if target.scheme() == "blob" {
                        return true;
                    }
                    open_external(target);
                    false
                })
                .on_new_window(|url, _| {
                    open_external(&url);
                    NewWindowResponse::Deny
                })
                .build()?;
            let show = MenuItem::with_id(app, "show", "打开 Daily Signal", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出 Daily Signal", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Daily Signal")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!());
    match application {
        Ok(app) => app.run(|handle, event| match event {
            tauri::RunEvent::Exit => {
                if let Some(state) = handle.try_state::<Mutex<Option<Backend>>>() {
                    if let Ok(mut backend) = state.lock() {
                        drop(backend.take());
                    }
                }
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => show_main(handle),
            _ => {}
        }),
        Err(error) => error_dialog(&format!("应用启动失败：{error}")),
    }
}
