import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { atom, useAtom, useStore } from 'jotai'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { Archive, ArrowUpRight, BookOpen, CheckCircle2, CircleAlert, FilePenLine, LoaderCircle, Menu, Newspaper, Rss, Settings2, ShieldCheck, X } from 'lucide-react'
import { Button } from './components/ui/button'
import { TodayView } from './components/TodayView'
import { FeedsView } from './components/FeedsView'
import { ArticlesView } from './components/ArticlesView'
import { ArchiveView } from './components/ArchiveView'
import { TemplateView } from './components/TemplateView'
import { SettingsView } from './components/SettingsView'
import { GenerationPanel } from './components/GenerationProgress'
import { dayBounds, errorMessage, formatDate, localDate, rpc } from './lib/client'
import type { Notice, Perform, View } from './lib/client'
import type { AppState, Settings } from '../shared/types'
import { appStateQueryOptions } from './lib/query'
import { apiKeyAtom, generationAtom } from './lib/state'
import { digestInputSchema } from '../shared/types'
import { updateProgress } from '../shared/progress'

const navigation = [
  { id: 'today', path: '/', label: '今日简报', icon: Newspaper },
  { id: 'feeds', path: '/feeds', label: '订阅源', icon: Rss },
  { id: 'articles', path: '/articles', label: '文章流', icon: BookOpen },
  { id: 'archive', path: '/archive', label: '日报归档', icon: Archive },
  { id: 'template', path: '/template', label: '日报模板', icon: FilePenLine },
  { id: 'settings', path: '/settings', label: 'AI 设置', icon: Settings2 },
] satisfies { id: View; path: string; label: string; icon: typeof Newspaper }[]

// These transient atoms coordinate events without putting request closures or
// credentials in TanStack's mutation variables/cache.
const pendingActionAtom = atom<(() => Promise<void>) | null>(null)
const operationLockAtom = atom(false)

function useActionMutation() {
  const store = useStore()
  const { mutateAsync, reset } = useMutation({
    mutationFn: async () => {
      const action = store.get(pendingActionAtom)
      if (!action) throw new Error('没有待执行的操作。')
      try {
        await action()
      } catch (error) {
        throw new Error(errorMessage(error))
      } finally {
        store.set(pendingActionAtom, null)
      }
    },
    retry: false,
    gcTime: 0,
    networkMode: 'always',
  })
  return useCallback(async (action: () => Promise<void>) => {
    store.set(pendingActionAtom, () => action)
    try {
      await mutateAsync()
    } finally {
      store.set(pendingActionAtom, null)
      reset()
    }
  }, [mutateAsync, reset, store])
}

export default function App() {
  const queryClient = useQueryClient()
  const stateQuery = useQuery(appStateQueryOptions)
  const state = stateQuery.data
  const routeNavigate = useNavigate()
  const { pathname } = useLocation()
  const [mobileMenu, setMobileMenu] = useState({ pathname, open: false })
  if (mobileMenu.pathname !== pathname) {
    setMobileMenu({ pathname, open: false })
  }
  const mobileOpen = mobileMenu.pathname === pathname && mobileMenu.open
  const [apiKey, setApiKey] = useAtom(apiKeyAtom)
  const [generation, setGeneration] = useAtom(generationAtom)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const runAction = useActionMutation()
  const store = useStore()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  const reload = useCallback(async () => {
    if (store.get(operationLockAtom)) return
    store.set(operationLockAtom, true)
    try {
      await queryClient.refetchQueries({ queryKey: appStateQueryOptions.queryKey, exact: true })
    } finally {
      store.set(operationLockAtom, false)
    }
  }, [queryClient, store])

  const perform: Perform = useCallback(async (label, action, success) => {
    if (store.get(operationLockAtom)) return false
    store.set(operationLockAtom, true)
    setBusy(label)
    setNotice(null)
    try {
      await runAction(action)
      try {
        await queryClient.invalidateQueries({ queryKey: appStateQueryOptions.queryKey, exact: true }, { throwOnError: true })
        if (success) setNotice({ kind: 'success', message: success })
      } catch {
        setNotice(current => ({
          kind: 'warning',
          message: '操作已完成，但最新数据读取失败。页面暂时保留上次数据，请重新读取状态，不要重复提交。',
          details: current ? [current.message, ...(current.details ?? [])] : undefined,
        }))
      }
      return true
    } catch (error) {
      setNotice({ kind: 'error', message: errorMessage(error) })
      return false
    } finally {
      store.set(operationLockAtom, false)
      setBusy(null)
    }
  }, [runAction, queryClient, store])

  const saveSettings = useCallback(async (settings: Settings) => {
    const saved = await rpc.settings.save(settings)
    await queryClient.cancelQueries({ queryKey: appStateQueryOptions.queryKey, exact: true })
    queryClient.setQueryData<AppState>(appStateQueryOptions.queryKey, current => current ? { ...current, settings: saved } : current)
    return saved
  }, [queryClient])

  function navigate(next: View) {
    void routeNavigate(next === 'today' ? '/' : `/${next}`)
  }
  function refresh() {
    void perform('刷新订阅', async () => {
      const result = await rpc.feeds.refresh()
      setNotice({ kind: result.errors.length ? 'warning' : 'success', message: `刷新完成，新增 ${result.added} 篇文章${result.errors.length ? `，${result.errors.length} 个来源获取失败。旧文章已保留。` : '。'}`, details: result.errors.map(item => `${item.url}：${item.error}`) })
    })
  }
  function generate(date: string) {
    void perform('生成日报', async () => {
      const input = digestInputSchema.parse({ date, ...dayBounds(date), apiKey })
      setGeneration({ date, status: 'running', startedAt: Date.now(), events: [] })
      let completed = false
      let failureMessage: string | undefined
      try {
        const events = await rpc.digests.generateStream(input)
        for await (const event of events) {
          if (event.type === 'progress') {
            setGeneration(current => current && ({ ...current, current: event.progress.message, events: updateProgress(current.events, event.progress) }))
          } else if (event.type === 'failed') {
            failureMessage = event.message
            throw new Error(event.message)
          } else {
            completed = true
            setGeneration(current => current && ({ ...current, status: 'complete', finishedAt: Date.now(), events: event.digest.workflow }))
            queryClient.setQueryData<AppState>(appStateQueryOptions.queryKey, current => current && ({ ...current, digests: [event.digest, ...current.digests.filter(digest => digest.id !== event.digest.id)] }))
          }
        }
        if (!completed) throw new Error('生成连接已中断，请查看归档确认是否已保存，再决定是否重试。')
      } catch (error) {
        if (completed) return
        const message = failureMessage ?? `生成连接中断或请求失败：${errorMessage(error)} 请查看归档确认是否已保存，再决定是否重试。`
        setGeneration(current => current && ({ ...current, status: 'failed', finishedAt: Date.now(), error: message }))
        throw new Error(message)
      }
    }, '日报已生成并归档。重要信息请通过原文核实。')
  }
  const loading = stateQuery.isFetching
  const loadError = stateQuery.isError ? errorMessage(stateQuery.error) : null
  const props = state ? { state, busy: busy || (loading ? '读取数据' : null), perform, notify: setNotice } : null

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">跳转到正文</a>
    <header className="mobile-header"><Link className="brand-button" to="/" aria-label="返回今日简报"><span className="brand-mark">d.</span><span>Daily Signal</span></Link><Button variant="ghost" size="icon" aria-label={mobileOpen ? '收起导航' : '展开导航'} aria-expanded={mobileOpen} aria-controls="sidebar-navigation" onClick={() => setMobileMenu({ pathname, open: !mobileOpen })}>{mobileOpen ? <X /> : <Menu />}</Button></header>
    <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`} id="sidebar-navigation">
      <Link className="brand-button desktop-brand" to="/"><span className="brand-mark">d.</span><span>Daily Signal<small>你的每日技术读本</small></span></Link>
      <div className="sidebar-rule" />
      <p className="nav-label">阅读工作台</p>
      <nav aria-label="主导航">{navigation.map(item => <NavLink key={item.id} to={item.path} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>{({ isActive }) => <><item.icon size={18} /><span>{item.label}</span>{item.id === 'feeds' && state && <span className="nav-count">{state.feeds.length}</span>}{isActive && <span className="nav-dot" />}</>}</NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="private-note"><ShieldCheck size={18} /><div><strong>只属于你的阅读空间</strong><p>数据留在本地，密钥仅在本页。<br />按需刷新，手动生成。</p></div></div><span className="sidebar-foot">少一点噪声，多一点洞见。<ArrowUpRight size={13} /></span></div>
    </aside>
    <main className="main-content" id="main-content" tabIndex={-1}>
      <div className="workspace-topline"><span>个人技术阅读工作台</span><time dateTime={localDate()}>{formatDate(localDate())}</time></div>
      {notice && <div className={`inline-notice global-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'success' ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}<div><p>{notice.message}</p>{notice.details?.length ? <details><summary>查看详情（{notice.details.length}）</summary><ul>{notice.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul></details> : null}</div><Button variant="ghost" size="icon-sm" aria-label="关闭通知" onClick={() => setNotice(null)}><X /></Button></div>}
      {busy && busy !== '生成日报' && <div className="busy-banner" role="status"><LoaderCircle className="spin" size={17} /><span>正在{busy}…请稍候。</span></div>}
      {generation && <GenerationPanel run={generation} />}
      {loadError && <div className="inline-notice error" role="alert"><p>{loadError}</p><Button variant="outline" disabled={loading || !!busy} onClick={() => void reload()}>{loading ? <LoaderCircle className="spin" /> : null}重新读取状态</Button></div>}
      {!state && loading && <div className="loading-state" role="status"><LoaderCircle className="spin" /><h1>正在打开你的阅读工作台</h1><p>读取本地订阅、设置与日报归档。</p></div>}
      <Routes>
        <Route path="/" element={props && <TodayView {...props} apiKey={apiKey} navigate={navigate} refresh={refresh} generate={generate} />} />
        <Route path="/feeds" element={props && <FeedsView {...props} refresh={refresh} />} />
        <Route path="/articles" element={props && <ArticlesView {...props} navigate={navigate} />} />
        <Route path="/archive" element={props && <ArchiveView {...props} navigate={navigate} />} />
        <Route path="/template" element={props && <TemplateView {...props} saveSettings={saveSettings} />} />
        <Route path="/settings" element={props && <SettingsView {...props} saveSettings={saveSettings} apiKey={apiKey} setApiKey={setApiKey} />} />
        <Route path="*" element={<section className="empty-list"><div className="eyebrow">404 · 页面未找到</div><h1>这页读本，还不存在。</h1><p>请检查地址，或回到今日简报继续阅读。</p><Link className="text-link" to="/">返回今日简报</Link></section>} />
      </Routes>
      <footer className="workspace-footer"><span>Daily Signal · 把信息留给机器，把思考留给你。</span><span>本地优先 / 自带密钥</span></footer>
    </main>
  </div>
}
