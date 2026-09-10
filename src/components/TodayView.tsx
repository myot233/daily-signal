import { ui } from "../lib/ui-styles"
import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Check, FileText, RefreshCw, Rss, Settings2, Sparkles } from 'lucide-react'
import { digestInputSchema } from '../../shared/types'
import { protocolLabels } from '../../shared/providers/catalog'
import { dayBounds, formatDate, localDate, rpc } from '../lib/client'
import type { View, ViewProps } from '../lib/client'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Report } from './Report'

export function TodayView({ state, busy, perform, navigate, refresh }: ViewProps & { navigate: (view: View) => void; refresh: () => void }) {
  const [date, setDate] = useState(localDate)
  const [now, setNow] = useState(Date.now)
  const [providerModelId, setProviderModelId] = useState(state.defaultProviderModelId ?? '')
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const modelChoices = state.providers.flatMap(provider => provider.enabled
    ? provider.models.filter(model => model.enabled).map(model => ({ provider, model })) : [])
  const activeProviderModelId = modelChoices.some(choice => choice.model.id === providerModelId) ? providerModelId : ''
  const report = state.digests.filter(item => item.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const bounds = date ? dayBounds(date) : null
  const visibleArticles = bounds ? state.articles.filter(article => article.publishedAt >= bounds.startAt && article.publishedAt < bounds.endAt) : []
  const failed = state.feeds.filter(feed => feed.error)
  const stale = state.feeds.filter(feed => !feed.lastFetchedAt || now - Date.parse(feed.lastFetchedAt) > 24 * 60 * 60 * 1000)
  const definitelyEmpty = state.articles.length < 500 && visibleArticles.length === 0
  const selectedModel = modelChoices.find(choice => choice.model.id === activeProviderModelId)
  const provider = selectedModel ? new URL(selectedModel.provider.baseUrl).hostname : null

  function generate() {
    void perform('生成日报', async () => {
      const input = digestInputSchema.parse({ date, ...dayBounds(date), providerModelId: activeProviderModelId })
      await rpc.digests.generate(input)
    }, '日报已生成并归档。重要信息请通过原文核实。')
  }

  return <>
    <div className="flex items-center justify-between gap-5.5 mt-0 mx-0 mb-7.5 [&_>_div:first-child]:min-w-0 [&_h1]:font-serif [&_h1]:text-[clamp(26px,_2.5vw,_36px)] [&_h1]:leading-[1.45] [&_h1]:font-semibold [&_h1]:tracking-[-.8px] [&_p]:text-muted-foreground [&_p]:mt-2.5 [&_p]:text-[12px] max-[640px]:items-start max-[640px]:flex-wrap max-[640px]:gap-4.25 max-[640px]:mb-5.5 max-[640px]:[&_h1]:text-[28px] max-[640px]:[&_h1]:tracking-[-1px] max-[640px]:[&_p]:text-[11px] max-[640px]:[&_p]:leading-[1.85] today-heading"><div><div className={ui.eyebrow}>每日一读 · 保持好奇</div><h1>看见变化，读懂意义。</h1><p>从你信任的来源出发，整理一份值得认真阅读的技术日报。</p></div><div className="flex flex-col items-center shrink-0 border border-[#c9bea8] py-2.75 px-5 -rotate-3 text-[#8d7c63] opacity-80 [&_span]:text-[9px] [&_span]:tracking-[3px] [&_strong]:font-serif [&_strong]:text-[20px] [&_strong]:font-normal [&_strong]:border-y [&_strong]:border-y-[#c9bea8] [&_strong]:my-1.25 [&_strong]:mx-0 [&_strong]:py-0.5 [&_strong]:px-0 [&_strong]:tracking-[3px] max-[800px]:hidden" aria-hidden="true"><span>你的</span><strong>每日信号</strong><span>技术 · 观察 · 思考</span></div></div>
    <div className="grid grid-cols-3 py-5.75 px-0 border-y border-y-border mb-6.25 [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-4 [&_>_div]:py-0 [&_>_div]:px-7 [&_>_div]:border-r [&_>_div]:border-r-border [&_>_div:first-child]:pl-1.25 [&_>_div:last-child]:border-0 [&_svg]:w-5.25 [&_svg]:text-[#a49a86] [&_svg]:stroke-[1.3] [&_>_div_>_span]:text-[#817b6c] [&_>_div_>_span]:text-[10px] [&_strong]:block [&_strong]:text-foreground [&_strong]:font-editorial [&_strong]:text-[28px] [&_strong]:leading-[1.4] [&_strong]:font-normal [&_small]:font-sans [&_small]:text-[10px] [&_small]:text-[#8b8577] max-[800px]:[&_>_div]:gap-2.25 max-[800px]:[&_>_div]:px-3.5 max-[800px]:[&_svg]:w-4.25 max-[640px]:py-4.5 max-[640px]:px-0 max-[640px]:mb-5 max-[640px]:[&_>_div]:py-0 max-[640px]:[&_>_div]:px-3 max-[640px]:[&_>_div]:gap-1.75 max-[640px]:[&_>_div]:items-start max-[640px]:[&_svg]:w-3.5 max-[640px]:[&_svg]:h-4.25 max-[640px]:[&_svg]:mt-0.5 max-[640px]:[&_>_div_>_span]:text-[9px] max-[640px]:[&_strong]:text-[25px] max-[640px]:[&_strong]:mt-1 max-[640px]:[&_small]:text-[8px]"><div><Rss /><span>订阅来源<strong>{state.feeds.length}<small> 个</small></strong></span></div><div><BookOpen /><span>当日可见文章<strong>{visibleArticles.length}<small> 篇{state.articles.length === 500 ? '（窗口内）' : ''}</small></strong></span></div><div><FileText /><span>已归档日报<strong>{state.digests.length}<small> 份</small></strong></span></div></div>
    <Card className="py-5.5 px-6.25 gap-3.75 shadow-[0_2px_7px_#4b371205] mb-6.25 max-[640px]:py-4.75 max-[640px]:px-4.5 max-[640px]:gap-3.25 max-[640px]:[&_>_.quiet-note]:text-[10px]">
      <div className="flex justify-between items-end gap-5 max-[900px]:items-stretch max-[900px]:flex-col max-[640px]:gap-3.75"><div className="grid flex-1 grid-cols-2 gap-4 max-[640px]:grid-cols-1"><div className="grid gap-2 min-w-0 [&_[data-slot=label]]:text-[12px]"><Label htmlFor="digest-date">阅读哪一天</Label><Input id="digest-date" type="date" required value={date} onChange={event => setDate(event.target.value)} disabled={!!busy} /><span className="text-[10px] text-muted-foreground">本地时区：{timezone}</span></div><div className="grid gap-2 min-w-0 [&_[data-slot=label]]:text-[12px]"><Label htmlFor="digest-model">本次使用模型</Label><select id="digest-model" className="h-10 min-w-0 rounded-md border border-input bg-paper px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={activeProviderModelId} disabled={!!busy} onChange={event => setProviderModelId(event.target.value)}><option value="">请选择连接与模型</option>{state.providers.filter(item => item.enabled).map(item => <optgroup key={item.id} label={item.name}>{item.models.filter(model => model.enabled).map(model => <option key={model.id} value={model.id}>{model.displayName || model.modelId}</option>)}</optgroup>)}</select><span className="truncate text-[10px] text-muted-foreground">{selectedModel ? `${selectedModel.provider.name} · ${protocolLabels[selectedModel.provider.protocol]}` : '在模型与服务商页面管理选项'}</span></div></div><div className="flex gap-2.25 max-[900px]:self-end max-[640px]:w-full max-[640px]:[&_>_button]:flex-1 max-[640px]:[&_>_button]:text-[12px]"><Button variant="outline" disabled={!!busy || !state.feeds.length} onClick={refresh}><RefreshCw className={busy === '刷新订阅' ? 'animate-spin' : ''} />刷新订阅</Button><Button disabled={!!busy || !date || !activeProviderModelId || !selectedModel?.provider.hasCredential || !state.feeds.length || definitelyEmpty} onClick={generate}><Sparkles />{report ? '重新生成一版' : '生成日报'}</Button></div></div>
      <div className="flex justify-between flex-wrap gap-2.25 pt-3.75 border-t border-t-border text-muted-foreground text-[10px] [&_>_span]:flex [&_>_span]:flex-wrap [&_>_span]:items-center [&_>_span]:gap-2 [&_>_span]:min-w-0 [&_[data-slot=badge]]:max-w-full [&_[data-slot=badge]]:wrap-anywhere [&_[data-slot=badge]]:whitespace-normal max-[640px]:text-[9px]"><span><Badge variant="secondary">{selectedModel?.model.displayName || selectedModel?.model.modelId || '未选择模型'}</Badge> 本次选择会在生成开始时冻结</span><button className="text-primary inline-flex items-center gap-1.25 no-underline bg-transparent border-0 text-[12px] hover:underline hover:underline-offset-3" onClick={() => navigate('settings')}>管理连接 <ArrowRight size={13} /></button></div>
      <p className="quiet-note text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere [&_strong]:font-medium [&_strong]:text-[#655747]">仅总结已缓存文章，不会自动刷新。文章内容与这条连接的 API Key 将发送至 <strong>{provider ?? '你选择的服务商'}</strong>。单日去重后最多 500 篇、输入最多 30 万字符；超过限制会在付费调用前拒绝，较多文章可能分批、多次计费。生成失败保留旧版。</p>
      {selectedModel && !selectedModel.provider.hasCredential && <p className="flex items-center flex-wrap gap-1.25 text-[#8b6b45] text-[11px]"><Settings2 size={15} />所选连接缺少 API Key。请在 <button className="inline-flex items-center gap-1.25 border-0 bg-transparent text-[inherit] underline underline-offset-3" onClick={() => navigate('settings')}>模型与服务商</button> 中保存。</p>}
      {!selectedModel && <p className="flex items-center flex-wrap gap-1.25 text-[#8b6b45] text-[11px]"><Settings2 size={15} />生成前，请选择一个已启用的连接与模型。</p>}
      {definitelyEmpty && state.feeds.length > 0 && <p className="flex items-center flex-wrap gap-1.25 text-[#8b6b45] text-[11px]">所选日期没有可总结的文章。请刷新订阅或选择其他日期；订阅只提供其当前公开的文章。</p>}
    </Card>
    {(failed.length > 0 || stale.length > 0) && <div className="border py-3.5 px-4.25 rounded-[7px] mb-5.5 text-[12px] leading-[1.8] wrap-anywhere [&.success]:bg-[#edf2e8] [&.success]:text-[#4d6542] [&.success]:border-[#d5e0cc] [&.warning]:bg-[#f7efdc] [&.warning]:text-[#826426] [&.warning]:border-[#e8d8b2] [&.error]:bg-[#f9eae3] [&.error]:text-[#a14536] [&.error]:border-[#edc8ba] [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:mt-2 [&_ul]:mx-0 [&_ul]:mb-0 [&_details]:mt-1.5 [&_>_button]:mt-2 warning"><p>{failed.length > 0 ? `${failed.length} 个来源最近获取失败，现有缓存仍可用于生成，信息可能不完整。` : '部分来源超过 24 小时未更新，建议先刷新再生成。'}</p><details><summary>查看来源状态</summary><ul>{state.feeds.filter(feed => failed.includes(feed) || stale.includes(feed)).map(feed => <li key={feed.id}><strong>{feed.title}</strong>：{feed.error || '缓存可能已过时'}；{feed.lastFetchedAt ? `上次成功 ${formatDate(feed.lastFetchedAt, true)}` : '尚无成功获取记录'}</li>)}</ul></details></div>}
    {report ? <Report digest={report} /> : <section className="pt-8.25 px-8.75 pb-6.75 bg-paper border border-border shadow-[0_5px_18px_#46371004] text-center [&_>_h2]:text-[25px] [&_>_h2]:font-serif [&_>_h2]:font-medium [&_>_h2]:tracking-[-.6px] [&_>_p]:text-[12px] [&_>_p]:text-muted-foreground [&_>_p]:mt-3 [&_>_p]:leading-[1.9] [&_>_.quiet-note]:text-[10px] [&_>_.quiet-note]:mt-6.5 max-[800px]:px-5.5 max-[640px]:pt-6.25 max-[640px]:px-4.5 max-[640px]:pb-5.5 max-[640px]:[&_>_h2]:text-[23px] max-[640px]:[&_>_p]:text-[11px]">
      <div className="flex items-center justify-center gap-4 text-[#948773] text-[10px] tracking-[3px] [&_span]:w-11.25 [&_span]:h-0.25 [&_span]:bg-[#ddd6c7] max-[640px]:text-[9px] max-[640px]:gap-2.5 max-[640px]:tracking-[1.5px] max-[640px]:[&_span]:w-7.5"><span />为重要的信息，留一页纸<span /></div>
      <div className="flex justify-center text-[#b8a98a] mt-6.25 mx-0 mb-4.5"><NewspaperIllustration /></div>
      <h2>{state.digests.length ? `${date ? formatDate(date) : '所选日期'}，等待你的第一版。` : '你的第一份日报，从这里开始。'}</h2>
      <p>不是更多的信息，而是更清晰的脉络。<br />选择来源、连接模型，让零散的文章成为有价值的每日阅读。</p>
      <div className="grid grid-cols-3 mt-7.5 pt-6.5 border-t border-t-border gap-3 max-[800px]:gap-1 max-[640px]:grid-cols-1 max-[640px]:gap-3 max-[640px]:pt-5 max-[640px]:mt-5.75">
        <button className={ui.onboardingStep} onClick={() => navigate('feeds')}><span className={`text-[12px] font-editorial font-normal leading-normal text-[#a89677] bg-[#f3efe4] grid place-items-center w-7.5 h-7.5 rounded-full mb-0.75 [&.complete]:text-[#61744d] [&.complete]:bg-[#edf0e4] max-[640px]:row-span-2 max-[640px]:m-0 max-[640px]:self-center ${state.feeds.length ? 'complete' : ''}`}>{state.feeds.length ? <Check size={17} /> : '01'}</span><strong>添加你的来源 <ArrowRight size={14} /></strong><span>RSS / Atom 或 OPML 导入</span></button>
        <button className={ui.onboardingStep} onClick={() => navigate('settings')}><span className={`text-[12px] font-editorial font-normal leading-normal text-[#a89677] bg-[#f3efe4] grid place-items-center w-7.5 h-7.5 rounded-full mb-0.75 [&.complete]:text-[#61744d] [&.complete]:bg-[#edf0e4] max-[640px]:row-span-2 max-[640px]:m-0 max-[640px]:self-center ${state.hasApiKey ? 'complete' : ''}`}>{state.hasApiKey ? <Check size={17} /> : '02'}</span><strong>连接 AI 模型 <ArrowRight size={14} /></strong><span>使用自己的 Key，配置保存在本地</span></button>
        <button className={ui.onboardingStep} onClick={() => navigate('template')}><span className="text-[12px] font-editorial font-normal leading-normal text-[#a89677] bg-[#f3efe4] grid place-items-center w-7.5 h-7.5 rounded-full mb-0.75 [&.complete]:text-[#61744d] [&.complete]:bg-[#edf0e4] max-[640px]:row-span-2 max-[640px]:m-0 max-[640px]:self-center">03</span><strong>让日报更像你 <ArrowRight size={14} /></strong><span>可直接使用默认模板，或自定义</span></button>
      </div>
      <p className="quiet-note text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere [&_strong]:font-medium [&_strong]:text-[#655747]">完成后，使用上方「生成日报」。没有自动任务，也没有预先生成的示例报告。</p>
    </section>}
  </>
}

function NewspaperIllustration() {
  return <svg width="106" height="86" viewBox="0 0 106 86" fill="none" aria-hidden="true"><path d="M18 13h65v61H18z" fill="var(--paper)" stroke="currentColor" /><path d="M83 24h9v44a6 6 0 0 1-6 6H23" stroke="currentColor" /><path d="M29 25h42M29 30h27M29 54h18M29 60h18M29 66h42M55 41h16M55 47h16M55 54h16M55 60h16" stroke="currentColor" opacity=".5" /><path d="M29 39h18v10H29z" fill="var(--primary)" opacity=".7" /><circle cx="85" cy="12" r="9" fill="var(--primary)" /><path d="m81 12 3 3 5-6" stroke="white" /></svg>
}
