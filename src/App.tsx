import { ui } from "./lib/ui-styles"
import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { atom, useStore } from 'jotai'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { Archive, ArrowUpRight, BookOpen, CheckCircle2, CircleAlert, FilePenLine, LoaderCircle, Menu, Newspaper, Rss, Settings2, ShieldCheck, X } from 'lucide-react'
import { Button } from './components/ui/button'
import { TodayView } from './components/TodayView'
import { FeedsView } from './components/FeedsView'
import { ArticlesView } from './components/ArticlesView'
import { ArchiveView } from './components/ArchiveView'
import { TemplateView } from './components/TemplateView'
import { SettingsView } from './components/SettingsView'
import { errorMessage, formatDate, localDate, rpc } from './lib/client'
import type { Notice, Perform, View } from './lib/client'
import type { AppState, SettingsUpdate } from '../shared/types'
import { appStateQueryOptions } from './lib/query'

const navigation = [
  { id: 'today', path: '/', label: '今日简报', icon: Newspaper },
  { id: 'feeds', path: '/feeds', label: '订阅源', icon: Rss },
  { id: 'articles', path: '/articles', label: '文章流', icon: BookOpen },
  { id: 'archive', path: '/archive', label: '日报归档', icon: Archive },
  { id: 'template', path: '/template', label: '日报模板', icon: FilePenLine },
  { id: 'settings', path: '/settings', label: '模型与服务商', icon: Settings2 },
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

  const saveSettings = useCallback(async (settings: SettingsUpdate) => {
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
  const loading = stateQuery.isFetching
  const loadError = stateQuery.isError ? errorMessage(stateQuery.error) : null
  const props = state ? { state, busy: busy || (loading ? '读取数据' : null), perform, notify: setNotice } : null

  return <div className="min-h-dvh">
    <a href="#main-content" className="fixed z-100 top-3 left-3 py-2.5 px-4.5 bg-primary text-white -translate-y-[160%] rounded-[6px] focus:translate-y-0">跳转到正文</a>
    <header className="hidden max-[640px]:flex max-[640px]:items-center max-[640px]:justify-between max-[640px]:h-16.5 max-[640px]:py-0 max-[640px]:px-5 max-[640px]:bg-[#eeede6] max-[640px]:border-b max-[640px]:border-b-[#ddd9cb] max-[640px]:sticky max-[640px]:top-0 max-[640px]:z-40 max-[640px]:[&_.brand-button]:text-[21px] max-[640px]:[&_.brand-mark]:w-7.75 max-[640px]:[&_.brand-mark]:h-8.5 max-[640px]:[&_.brand-mark]:text-[29px]"><Link className="brand-button border-0 bg-transparent flex items-center text-left gap-3 text-foreground font-serif text-[22px] font-bold tracking-[-.7px] [&_small]:block [&_small]:text-muted-foreground [&_small]:font-sans [&_small]:text-[10px] [&_small]:font-normal [&_small]:tracking-[2px] [&_small]:mt-0.75 max-[1150px]:text-[20px] max-[1150px]:gap-2.5 max-[800px]:[&_small]:text-[8px] max-[800px]:[&_small]:tracking-[1px]" to="/" aria-label="返回今日简报"><span className="brand-mark grid place-items-center w-9.75 h-10.5 flex-none bg-primary text-[#fffaf4] font-editorial font-normal text-[35px] leading-[1] tracking-[-2px] rounded-[3px] pb-1.25 max-[800px]:w-8.25 max-[800px]:h-9.25 max-[800px]:text-[30px]">d.</span><span>Daily Signal</span></Link><Button variant="ghost" size="icon" aria-label={mobileOpen ? '收起导航' : '展开导航'} aria-expanded={mobileOpen} aria-controls="sidebar-navigation" onClick={() => setMobileMenu({ pathname, open: !mobileOpen })}>{mobileOpen ? <X /> : <Menu />}</Button></header>
    <aside className={`w-59.5 fixed inset-y-0 left-0 bg-[#eeede6] border-r border-r-border flex flex-col pt-9.25 px-5.25 pb-6 z-30 [&_nav]:grid [&_nav]:gap-1.5 max-[1150px]:w-53.5 max-[1150px]:px-3.75 max-[800px]:w-47.5 max-[800px]:px-2.75 max-[640px]:hidden max-[640px]:sticky max-[640px]:top-16.5 max-[640px]:w-full max-[640px]:py-3.25 max-[640px]:px-4.25 max-[640px]:border-r-0 max-[640px]:border-b max-[640px]:border-b-[#d5d0c1] max-[640px]:bg-[#eeede6] max-[640px]:max-h-[calc(100dvh_-_66px)] max-[640px]:overflow-y-auto max-[640px]:[&.is-open]:block max-[640px]:[&_nav]:grid-cols-2 max-[640px]:[&_nav]:gap-1.25 max-[640px]:[&_.desktop-brand]:hidden ${mobileOpen ? 'is-open' : ''}`} id="sidebar-navigation">
      <Link className="brand-button border-0 bg-transparent flex items-center text-left gap-3 text-foreground font-serif text-[22px] font-bold tracking-[-.7px] [&_small]:block [&_small]:text-muted-foreground [&_small]:font-sans [&_small]:text-[10px] [&_small]:font-normal [&_small]:tracking-[2px] [&_small]:mt-0.75 max-[1150px]:text-[20px] max-[1150px]:gap-2.5 max-[800px]:[&_small]:text-[8px] max-[800px]:[&_small]:tracking-[1px] desktop-brand max-[800px]:gap-2 max-[800px]:text-[18px]" to="/"><span className="brand-mark grid place-items-center w-9.75 h-10.5 flex-none bg-primary text-[#fffaf4] font-editorial font-normal text-[35px] leading-[1] tracking-[-2px] rounded-[3px] pb-1.25 max-[800px]:w-8.25 max-[800px]:h-9.25 max-[800px]:text-[30px]">d.</span><span>Daily Signal<small>你的每日技术读本</small></span></Link>
      <div className="h-0.25 bg-[#d9d6ca] mt-8 mx-1.75 mb-6.75 max-[640px]:hidden" />
      <p className="text-[#8a877c] text-[10px] tracking-[2px] mt-0 mx-3.25 mb-3 max-[640px]:hidden">阅读工作台</p>
      <nav aria-label="主导航">{navigation.map(item => <NavLink key={item.id} to={item.path} end className={({ isActive }) => `flex items-center gap-3.25 w-full py-3 px-3.5 border border-transparent rounded-[6px] text-left text-[#6d6a61] bg-transparent text-[13px] transition-colors duration-160 hover:bg-[#e7e4da] hover:text-foreground [&.active]:bg-[#faf8f1] [&.active]:text-primary [&.active]:border-[#e4dfd1] [&.active]:shadow-[0_2px_4px_#35271903] [&.active]:font-semibold max-[640px]:py-2.5 max-[640px]:px-3.25 max-[640px]:text-[12px] ${isActive ? 'active' : ''}`}>{({ isActive }) => <><item.icon size={18} /><span>{item.label}</span>{item.id === 'feeds' && state && <span className="ml-auto text-[11px] text-[#8a8578]">{state.feeds.length}</span>}{isActive && <span className="w-1.25 h-1.25 bg-primary rounded-full ml-auto" />}</>}</NavLink>)}</nav>
      <div className="mt-auto pt-12 max-[640px]:hidden"><div className="border-t border-t-[#dad7cb] py-5.5 px-1.25 flex items-start gap-2.25 text-[#6c7062] [&_svg]:mt-0.5 [&_svg]:shrink-0 [&_strong]:text-[11px] [&_strong]:font-medium [&_p]:text-[10px] [&_p]:text-[#898679] [&_p]:leading-[1.9] [&_p]:mt-1.5"><ShieldCheck size={18} /><div><strong>只属于你的阅读空间</strong><p>配置与密钥保存在本地。<br />按需刷新，手动生成。</p></div></div><span className="flex justify-between text-[#969083] text-[10px] py-0 px-1.25">少一点噪声，多一点洞见。<ArrowUpRight size={13} /></span></div>
    </aside>
    <main className="max-w-375 ml-59.5 pt-0 px-12 pb-5.5 min-h-dvh min-[1700px]:px-17.5 max-[1150px]:ml-53.5 max-[1150px]:px-7.5 max-[800px]:ml-47.5 max-[800px]:px-5.5 max-[640px]:ml-0 max-[640px]:pt-0 max-[640px]:px-5 max-[640px]:pb-5" id="main-content" tabIndex={-1}>
      <div className="h-19.75 flex items-center justify-between border-b border-b-border text-[11px] text-[#827e72] tracking-[.5px] mb-9.75 max-[640px]:h-13.5 max-[640px]:text-[9px] max-[640px]:mb-6.5 max-[640px]:tracking-[0]"><span>个人技术阅读工作台</span><time dateTime={localDate()}>{formatDate(localDate())}</time></div>
      {notice && <div className={`border py-3.5 px-4.25 rounded-[7px] mb-5.5 text-[12px] leading-[1.8] wrap-anywhere [&.success]:bg-[#edf2e8] [&.success]:text-[#4d6542] [&.success]:border-[#d5e0cc] [&.warning]:bg-[#f7efdc] [&.warning]:text-[#826426] [&.warning]:border-[#e8d8b2] [&.error]:bg-[#f9eae3] [&.error]:text-[#a14536] [&.error]:border-[#edc8ba] [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:mt-2 [&_ul]:mx-0 [&_ul]:mb-0 [&_details]:mt-1.5 flex gap-2.75 items-start [&_>_svg]:mt-0.5 [&_>_svg]:flex-none [&_>_div]:flex-1 [&_>_div]:min-w-0 [&_>_button]:-mt-0.75 [&_>_button]:-mr-1.25 [&_>_button]:-mb-0.75 [&_>_button]:ml-0 ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'success' ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}<div><p>{notice.message}</p>{notice.details?.length ? <details><summary>查看详情（{notice.details.length}）</summary><ul>{notice.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul></details> : null}</div><Button variant="ghost" size="icon-sm" aria-label="关闭通知" onClick={() => setNotice(null)}><X /></Button></div>}
      {busy && <div className="flex items-center gap-2.5 bg-[#ede9dc] text-[#7a6647] py-3 px-4 text-[12px] mb-5.5 rounded-[6px] [&_svg]:shrink-0" role="status"><LoaderCircle className="animate-spin" size={17} /><span>正在{busy}…{busy === '生成日报' ? '文章较多时将分批处理，可能发起多次模型调用，请保持页面打开。' : '请稍候。'}</span></div>}
      {loadError && <div className="border py-3.5 px-4.25 rounded-[7px] mb-5.5 text-[12px] leading-[1.8] wrap-anywhere [&.success]:bg-[#edf2e8] [&.success]:text-[#4d6542] [&.success]:border-[#d5e0cc] [&.warning]:bg-[#f7efdc] [&.warning]:text-[#826426] [&.warning]:border-[#e8d8b2] [&.error]:bg-[#f9eae3] [&.error]:text-[#a14536] [&.error]:border-[#edc8ba] [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:mt-2 [&_ul]:mx-0 [&_ul]:mb-0 [&_details]:mt-1.5 [&_>_button]:mt-2 error" role="alert"><p>{loadError}</p><Button variant="outline" disabled={loading || !!busy} onClick={() => void reload()}>{loading ? <LoaderCircle className="animate-spin" /> : null}重新读取状态</Button></div>}
      {!state && loading && <div className="min-h-100 flex flex-col items-center justify-center gap-5 text-center text-muted-foreground [&_h1]:font-serif [&_h1]:text-[24px] [&_h1]:text-foreground" role="status"><LoaderCircle className="animate-spin" /><h1>正在打开你的阅读工作台</h1><p>读取本地订阅、设置与日报归档。</p></div>}
      <Routes>
        <Route path="/" element={props && <TodayView {...props} navigate={navigate} refresh={refresh} />} />
        <Route path="/feeds" element={props && <FeedsView {...props} refresh={refresh} />} />
        <Route path="/articles" element={props && <ArticlesView {...props} navigate={navigate} />} />
        <Route path="/archive" element={props && <ArchiveView {...props} navigate={navigate} />} />
        <Route path="/template" element={props && <TemplateView {...props} saveSettings={saveSettings} />} />
        <Route path="/settings" element={props && <SettingsView {...props} />} />
        <Route path="/settings/providers/:providerId" element={props && <SettingsView {...props} />} />
        <Route path="*" element={<section className={ui.emptyState}><div className={ui.eyebrow}>404 · 页面未找到</div><h1>这页读本，还不存在。</h1><p>请检查地址，或回到今日简报继续阅读。</p><Link className="text-primary inline-flex items-center gap-1.25 no-underline bg-transparent border-0 text-[12px] hover:underline hover:underline-offset-3" to="/">返回今日简报</Link></section>} />
      </Routes>
      <footer className="mt-14 border-t border-t-border pt-5 flex flex-wrap justify-between gap-3 text-[#928d81] text-[10px] tracking-[.3px] max-[640px]:text-[9px] max-[640px]:mt-9.25"><span>Daily Signal · 把信息留给机器，把思考留给你。</span><span>本地优先 / 自带密钥</span></footer>
    </main>
  </div>
}
