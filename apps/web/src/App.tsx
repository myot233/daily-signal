import { ui } from '@daily-signal/ui/styles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { atom, useStore } from 'jotai';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  FilePenLine,
  LoaderCircle,
  Menu,
  Newspaper,
  RefreshCw,
  Rss,
  Settings2,
  X,
} from 'lucide-react';
import { Button } from '@daily-signal/ui/button';
import { TodayView } from './components/TodayView';
import { FeedsView } from './components/FeedsView';
import { FeedRefreshProgress } from './components/FeedRefreshProgress';
import { ArticlesView } from './components/ArticlesView';
import { ArchiveView } from './components/ArchiveView';
import { TemplateView } from './components/TemplateView';
import { SettingsView } from './components/SettingsView';
import { errorMessage, rpc } from '@daily-signal/client';
import type {
  DigestGenerationState,
  Notice,
  Perform,
  StartDigestGeneration,
  View,
} from '@daily-signal/client';
import type { AppState, SettingsUpdate } from '@daily-signal/domain';
import { appStateQueryOptions, feedRefreshQueryOptions } from '@daily-signal/client/query';

const navigation = [
  { id: 'today', path: '/', label: '今日简报', icon: Newspaper },
  { id: 'feeds', path: '/feeds', label: '订阅源', icon: Rss },
  { id: 'articles', path: '/articles', label: '文章流', icon: BookOpen },
  { id: 'archive', path: '/archive', label: '日报归档', icon: Archive },
  { id: 'template', path: '/template', label: '日报设置', icon: FilePenLine },
  { id: 'settings', path: '/settings', label: '模型与服务商', icon: Settings2 },
] satisfies { id: View; path: string; label: string; icon: typeof Newspaper }[];

// These transient atoms coordinate events without putting request closures or
// credentials in TanStack's mutation variables/cache.
const pendingActionAtom = atom<(() => Promise<void>) | null>(null);
const operationLockAtom = atom(false);

function useActionMutation() {
  const store = useStore();
  const { mutateAsync, reset } = useMutation({
    mutationFn: async () => {
      const action = store.get(pendingActionAtom);
      if (!action) throw new Error('没有待执行的操作。');
      try {
        await action();
      } catch (error) {
        throw new Error(errorMessage(error));
      } finally {
        store.set(pendingActionAtom, null);
      }
    },
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  });
  return useCallback(
    async (action: () => Promise<void>) => {
      store.set(pendingActionAtom, () => action);
      try {
        await mutateAsync();
      } finally {
        store.set(pendingActionAtom, null);
        reset();
      }
    },
    [mutateAsync, reset, store],
  );
}

export default function App() {
  const queryClient = useQueryClient();
  const stateQuery = useQuery(appStateQueryOptions);
  const feedRefreshQuery = useQuery(feedRefreshQueryOptions);
  const feedRefresh = feedRefreshQuery.data;
  const feedRefreshRunning = feedRefresh?.status === 'running';
  const lastFeedUpdate = useRef({ id: '', completed: 0, time: 0, finished: false });
  const state = stateQuery.data;
  const routeNavigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileMenu, setMobileMenu] = useState({ pathname, open: false });
  if (mobileMenu.pathname !== pathname) {
    setMobileMenu({ pathname, open: false });
  }
  const mobileOpen = mobileMenu.pathname === pathname && mobileMenu.open;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [digestGeneration, setDigestGeneration] = useState<DigestGenerationState | null>(null);
  const runAction = useActionMutation();
  const store = useStore();
  const latestDigestGenerationEvent = digestGeneration?.events.at(-1);
  const digestGenerationTerminal =
    latestDigestGenerationEvent?.type === 'completed' ||
    latestDigestGenerationEvent?.type === 'failed';
  const activeDigestGenerationSessionId = state?.activeDigestGenerationSessionId ?? null;
  const generationSessionId =
    activeDigestGenerationSessionId ??
    (digestGenerationTerminal ? null : (digestGeneration?.sessionId ?? null));
  const visibleDigestGeneration =
    activeDigestGenerationSessionId &&
    digestGeneration?.sessionId !== activeDigestGenerationSessionId
      ? { sessionId: activeDigestGenerationSessionId, events: [] }
      : digestGeneration;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  useEffect(() => {
    if (!feedRefresh) return;
    const previous = lastFeedUpdate.current;
    const finished = feedRefresh.status !== 'running';
    const changed = previous.id !== feedRefresh.id || previous.completed !== feedRefresh.completed;
    if (
      (finished && (!previous.finished || previous.id !== feedRefresh.id)) ||
      (changed && Date.now() - previous.time >= 3_000)
    ) {
      lastFeedUpdate.current = {
        id: feedRefresh.id,
        completed: feedRefresh.completed,
        time: Date.now(),
        finished,
      };
      void queryClient.invalidateQueries({ queryKey: appStateQueryOptions.queryKey, exact: true });
    }
  }, [feedRefresh, queryClient]);

  useEffect(() => {
    const sessionId = generationSessionId;
    if (!sessionId) return;

    const controller = new AbortController();
    let afterEventId = 0;
    void (async () => {
      while (!controller.signal.aborted) {
        try {
          const events = await rpc.digests.subscribe(
            { sessionId, afterEventId },
            { signal: controller.signal },
          );
          for await (const event of events) {
            afterEventId = event.id;
            setDigestGeneration((current) => {
              const currentEvents = current?.sessionId === sessionId ? current.events : [];
              if (currentEvents.some((existing) => existing.id === event.id)) return current;
              return { sessionId, events: [...currentEvents, event] };
            });
            if (event.type !== 'completed' && event.type !== 'failed') continue;

            queryClient.setQueryData<AppState>(appStateQueryOptions.queryKey, (current) =>
              current ? { ...current, activeDigestGenerationSessionId: null } : current,
            );
            try {
              await queryClient.invalidateQueries(
                { queryKey: appStateQueryOptions.queryKey, exact: true },
                { throwOnError: true },
              );
              setNotice(
                event.type === 'completed'
                  ? { kind: 'success', message: '日报已生成并归档。重要信息请通过原文核实。' }
                  : { kind: 'error', message: event.message },
              );
            } catch {
              setNotice({
                kind: 'warning',
                message:
                  event.type === 'completed'
                    ? '日报已生成，但最新归档读取失败。请重新读取状态，不要重复生成。'
                    : event.message,
              });
            }
            return;
          }
          return;
        } catch {
          if (controller.signal.aborted) return;
          setNotice({
            kind: 'warning',
            message: '实时进度连接中断，正在从本地事件队列续接。',
          });
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        }
      }
    })();
    return () => controller.abort();
  }, [generationSessionId, queryClient]);

  const reload = useCallback(async () => {
    if (store.get(operationLockAtom)) return;
    store.set(operationLockAtom, true);
    try {
      await queryClient.refetchQueries({ queryKey: appStateQueryOptions.queryKey, exact: true });
    } finally {
      store.set(operationLockAtom, false);
    }
  }, [queryClient, store]);

  const perform: Perform = useCallback(
    async (label, action, success) => {
      if (store.get(operationLockAtom)) return false;
      store.set(operationLockAtom, true);
      setBusy(label);
      setNotice(null);
      try {
        await runAction(action);
        await queryClient.invalidateQueries({
          queryKey: feedRefreshQueryOptions.queryKey,
          exact: true,
        });
        try {
          await queryClient.invalidateQueries(
            { queryKey: appStateQueryOptions.queryKey, exact: true },
            { throwOnError: true },
          );
          if (success) setNotice({ kind: 'success', message: success });
        } catch {
          setNotice((current) => ({
            kind: 'warning',
            message:
              '操作已完成，但最新数据读取失败。页面暂时保留上次数据，请重新读取状态，不要重复提交。',
            details: current ? [current.message, ...(current.details ?? [])] : undefined,
          }));
        }
        return true;
      } catch (error) {
        setNotice({ kind: 'error', message: errorMessage(error) });
        return false;
      } finally {
        store.set(operationLockAtom, false);
        setBusy(null);
      }
    },
    [runAction, queryClient, store],
  );
  const startDigestGeneration: StartDigestGeneration = useCallback(
    async (input) => {
      let sessionId: string | null = null;
      const started = await perform('生成日报', async () => {
        const result = await rpc.digests.generate(input);
        sessionId = result.sessionId;
        setDigestGeneration({ sessionId: result.sessionId, events: [] });
      });
      return started && sessionId !== null;
    },
    [perform],
  );

  const saveSettings = useCallback(
    async (settings: SettingsUpdate) => {
      const saved = await rpc.settings.save(settings);
      await queryClient.cancelQueries({ queryKey: appStateQueryOptions.queryKey, exact: true });
      queryClient.setQueryData<AppState>(appStateQueryOptions.queryKey, (current) =>
        current ? { ...current, settings: saved } : current,
      );
      return saved;
    },
    [queryClient],
  );

  function navigate(next: View) {
    void routeNavigate(next === 'today' ? '/' : `/${next}`);
  }
  function refresh() {
    void perform('刷新订阅', async () => {
      await rpc.feeds.refresh();
      setNotice({ kind: 'success', message: '已开始后台抓取文章，可以继续阅读。' });
    });
  }
  const loading = stateQuery.isFetching;
  const loadError = stateQuery.isError ? errorMessage(stateQuery.error) : null;
  const generationRunning = Boolean(
    activeDigestGenerationSessionId || (digestGeneration && !digestGenerationTerminal),
  );
  const props = state
    ? {
        state,
        busy: busy || (generationRunning ? '生成日报' : loading ? '读取数据' : null),
        perform,
        notify: setNotice,
      }
    : null;

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        跳转到正文
      </a>
      <header className="mobile-toolbar">
        <Button
          variant="ghost"
          size="icon"
          aria-label={mobileOpen ? '收起导航' : '展开导航'}
          aria-expanded={mobileOpen}
          aria-controls="sidebar-navigation"
          onClick={() => setMobileMenu({ pathname, open: !mobileOpen })}
        >
          {mobileOpen ? <X /> : <Menu />}
        </Button>
        <strong>Daily Signal</strong>
      </header>
      <aside className={`app-sidebar ${mobileOpen ? 'is-open' : ''}`} id="sidebar-navigation">
        <Link className="app-brand" to="/">
          <span className="app-brand-icon">
            <Newspaper size={17} />
          </span>
          Daily Signal
        </Link>
        <nav aria-label="主导航">
          {navigation.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.id !== 'settings'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              {
                <>
                  <item.icon size={16} />
                  <span>{item.label}</span>
                  {state && ['feeds', 'articles', 'archive'].includes(item.id) && (
                    <span className="sidebar-count">
                      {item.id === 'feeds'
                        ? state.feeds.length
                        : item.id === 'articles'
                          ? state.articles.length
                          : state.digests.length}
                    </span>
                  )}
                </>
              }
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Button
            variant="ghost"
            className="w-full justify-start"
            disabled={!!busy || feedRefreshRunning || !state?.feeds.length}
            onClick={refresh}
          >
            <RefreshCw size={15} className={feedRefreshRunning ? 'animate-spin' : ''} />
            刷新订阅
          </Button>
          <span className="sidebar-status">
            <span aria-hidden="true" />
            {generationRunning ? '正在生成日报' : '本地运行'}
          </span>
        </div>
      </aside>
      <main className="app-main" id="main-content" tabIndex={-1}>
        {notice && (
          <div
            className={`app-notice ${notice.kind}`}
            role={notice.kind === 'error' ? 'alert' : 'status'}
          >
            {notice.kind === 'success' ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            <div>
              <p>{notice.message}</p>
              {notice.details?.length ? (
                <details>
                  <summary>详情（{notice.details.length}）</summary>
                  <ul>
                    {notice.details.map((detail, index) => (
                      <li key={index}>{detail}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="关闭通知"
              onClick={() => setNotice(null)}
            >
              <X />
            </Button>
          </div>
        )}
        {busy && busy !== '生成日报' && (
          <div className="app-progress" role="status">
            <LoaderCircle className="animate-spin" size={15} />
            <span>正在{busy}…</span>
          </div>
        )}
        <FeedRefreshProgress value={feedRefresh} />
        {feedRefreshQuery.isError && (
          <div className="app-notice warning" role="status">
            <p>暂时无法读取抓取进度，后台任务可能仍在继续。</p>
            <Button variant="outline" onClick={() => void feedRefreshQuery.refetch()}>
              重试进度
            </Button>
          </div>
        )}
        {loadError && (
          <div className="app-notice error" role="alert">
            <p>{loadError}</p>
            <Button variant="outline" disabled={loading || !!busy} onClick={() => void reload()}>
              重试
            </Button>
          </div>
        )}
        <div className="app-content">
          {!state && loading && (
            <div className={ui.emptyState} role="status">
              <LoaderCircle className="animate-spin" />
              <h1>正在加载…</h1>
            </div>
          )}
          <Routes>
            <Route
              path="/"
              element={
                props && (
                  <TodayView
                    {...props}
                    generation={visibleDigestGeneration}
                    startGeneration={startDigestGeneration}
                    navigate={navigate}
                    refresh={refresh}
                  />
                )
              }
            />
            <Route
              path="/feeds"
              element={
                props && <FeedsView {...props} refreshing={feedRefreshRunning} refresh={refresh} />
              }
            />
            <Route
              path="/articles"
              element={props && <ArticlesView {...props} desktopLayout navigate={navigate} />}
            />
            <Route
              path="/archive"
              element={props && <ArchiveView {...props} navigate={navigate} />}
            />
            <Route
              path="/template"
              element={props && <TemplateView {...props} saveSettings={saveSettings} />}
            />
            <Route path="/settings" element={props && <SettingsView {...props} />} />
            <Route
              path="/settings/providers/:providerId"
              element={props && <SettingsView {...props} />}
            />
            <Route
              path="*"
              element={
                <section className={ui.emptyState}>
                  <h1>页面不存在</h1>
                  <Link className="text-primary" to="/">
                    返回今日简报
                  </Link>
                </section>
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}
