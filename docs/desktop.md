# Daily Signal 桌面版

桌面版使用 Tauri 2 和系统 WebView，内置现有 Node.js 后端及 SQLite。用户双击应用即可使用，无需安装 Node.js、pnpm 或 Rust，也无需运行命令。当前打包入口支持在 macOS 上按本机架构构建（Apple Silicon / Intel），尚未提供 Windows / Linux 安装包。

## 开发与打包

开发机需要 Node.js 24+、项目指定的 pnpm、Rust stable 和 Xcode Command Line Tools。先按仓库 AGENTS.md 安装依赖。

```sh
pnpm desktop:dev
pnpm desktop:build
```

两者都会先构建前端、打包后端。构建脚本检查 Node.js 的动态库依赖：可独立运行的 Node.js（如官方安装包或 nvm 安装的版本）直接复用；Homebrew 等依赖本机动态库的版本则下载对应版本的官方独立运行环境，使用官方 SHA-256 清单校验。下载缓存位于 `.desktop/cache/`。Rust 与 Node.js 的架构必须相同；不支持直接交叉编译此打包流程。

也可设置 `DAILY_SIGNAL_NODE_BINARY` 指向已有的独立 Node.js 24+ 可执行文件，其安装目录须保留 `LICENSE`。脚本检查架构与动态库依赖，并用实际打包的运行环境执行 SQLite 内存读写检查。

安装产物位于 `src-tauri/target/release/bundle/macos/Daily Signal.app` 和 `src-tauri/target/release/bundle/dmg/`。此配置用于个人本机使用；对外分发前需另行配置 Apple 签名和公证。

`desktop:dev` 使用预构建前后端；修改 TypeScript 后重新运行即可。浏览器开发继续使用 `pnpm dev`，保留原有热更新。

## 运行与数据

- 启动时自动选择空闲的回环端口，服务准备好后才显示窗口。
- 关闭窗口后保留菜单栏图标，定时日报仍可运行；菜单栏“退出 Daily Signal”或 Cmd+Q 完全退出，并关闭数据库与后台进程。电脑睡眠或应用退出期间不会运行定时任务。
- 重复启动聚焦已有窗口；外部文章在系统浏览器中打开。
- 数据默认位于 `~/Library/Application Support/com.myot.daily-signal/daily-signal.sqlite`。启动故障日志为同目录的 `desktop-backend.log`。
- 安装包不包含开发数据库和模型密钥。首次启动建立新数据库，原有 `data/daily-signal.sqlite` 不受影响。迁移旧数据前应停止旧服务和桌面应用，确认目标并使用 SQLite 备份；不要在服务运行时只复制 `.sqlite` 文件而遗漏 WAL。
- 验证时可以设置 `DAILY_SIGNAL_DATA_DIR` 为独立临时目录，禁止使用真实用户数据库做测试。

## 验证

```sh
pnpm check
pnpm build
pnpm build-storybook
pnpm desktop:prepare
pnpm desktop:test
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
pnpm desktop:build
```

桌面烟雾测试把资源和运行环境复制到带空格的独立目录，移除开发机 Node.js 的 PATH，验证启动、前端资源、RPC、跨域拒绝、SQLite 持久化及父进程断开后的退出。桌面窗口、菜单栏、外部链接和导出功能还需在打包后的应用中验证。

浏览器下载不可用时，可用 `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome pnpm check` 在已安装的 Chrome 中执行同一组测试；默认 CI 仍使用 Playwright 管理的 Chromium，不设置此变量。
