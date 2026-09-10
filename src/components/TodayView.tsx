import { maxBy } from 'es-toolkit/array'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  Database,
  FileText,
  Layers3,
  LoaderCircle,
  RefreshCw,
  Rss,
  Settings2,
  Sparkles,
} from 'lucide-react'
import { digestInputSchema } from '../../shared/types'
import { protocolLabels } from '../../shared/providers/catalog'
import { dayBounds, formatDate, localDate } from '../lib/client'
import type {
  DigestGenerationState,
  StartDigestGeneration,
  View,
  ViewProps,
} from '../lib/client'
import { ui } from '../lib/ui-styles'
import { ProviderIcon } from './ProviderIcon'
import { Report } from './Report'
import { Task, TaskContent, TaskItem, TaskTrigger } from './ai-elements/task'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'

function generationEventLabel(event: DigestGenerationState['events'][number]): string {
  switch (event.type) {
    case 'queued':
      return '任务已写入本地生成队列'
    case 'preparing':
      return `已读取 ${event.articleCount} 篇文章，规划为 ${event.batchCount} 个批次`
    case 'extracting':
      return `正在提取资料批次 ${event.current}/${event.total}`
    case 'synthesizing':
      return '正在合成日报正文'
    case 'archiving':
      return '正在保存日报与来源快照'
    case 'completed':
      return '日报已生成并归档'
    case 'failed':
      return `生成未完成：${event.message}`
  }
}


export function TodayView({
  state,
  busy,
  generation,
  startGeneration,
  navigate,
  refresh,
  initialDate = localDate(),
}: ViewProps & {
  generation: DigestGenerationState | null
  startGeneration: StartDigestGeneration
  navigate: (view: View) => void
  refresh: () => void
  initialDate?: string
}) {
  const [date, setDate] = useState(initialDate)
  const [now, setNow] = useState(Date.now)
  const [providerModelId, setProviderModelId] = useState(state.defaultProviderModelId ?? '')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const modelChoices = state.providers.flatMap(provider => provider.enabled
    ? provider.models.filter(model => model.enabled).map(model => ({ provider, model }))
    : [])
  const activeProviderModelId = modelChoices.some(choice => choice.model.id === providerModelId) ? providerModelId : ''
  const report = maxBy(
    state.digests.filter(item => item.date === date),
    item => Date.parse(item.createdAt),
  )
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const bounds = date ? dayBounds(date) : null
  const visibleArticles = bounds ? state.articles.filter(article => article.publishedAt >= bounds.startAt && article.publishedAt < bounds.endAt) : []
  const failed = state.feeds.filter(feed => feed.error)
  const stale = state.feeds.filter(feed => !feed.lastFetchedAt || now - Date.parse(feed.lastFetchedAt) > 24 * 60 * 60 * 1000)
  const definitelyEmpty = state.articles.length < 500 && visibleArticles.length === 0
  const selectedModel = modelChoices.find(choice => choice.model.id === activeProviderModelId)
  const providerHost = selectedModel ? new URL(selectedModel.provider.baseUrl).hostname : null
  const selectedModelName = selectedModel?.model.displayName || selectedModel?.model.modelId || '尚未选择模型'
  const selectedModelContext = selectedModel ? `${selectedModel.provider.name} · ${protocolLabels[selectedModel.provider.protocol]}` : '前往模型与服务商配置'
  const generating = busy === '生成日报'
  const generationEvents = generation?.events ?? []
  const latestGenerationEvent = generationEvents.at(-1)
  const canGenerate = Boolean(!busy && date && selectedModel?.provider.hasCredential && state.feeds.length && !definitelyEmpty)
  const templateLabel = state.settings.template === state.defaultTemplate ? '默认模板' : '自定义模板'

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canGenerate) return
    const input = digestInputSchema.parse({
      date,
      ...dayBounds(date),
      providerModelId: activeProviderModelId,
    })
    void startGeneration(input)
  }

  return <>
    <div className="today-heading mb-7.5 flex items-center justify-between gap-5.5 max-[640px]:mb-5.5 max-[640px]:flex-wrap max-[640px]:items-start max-[640px]:gap-4.25 [&_>div:first-child]:min-w-0 [&_h1]:font-serif [&_h1]:text-[clamp(26px,_2.5vw,_36px)] [&_h1]:font-semibold [&_h1]:leading-[1.45] [&_h1]:tracking-[-.8px] max-[640px]:[&_h1]:text-[28px] max-[640px]:[&_h1]:tracking-[-1px] [&_p]:mt-2.5 [&_p]:text-[12px] [&_p]:text-muted-foreground max-[640px]:[&_p]:text-[11px] max-[640px]:[&_p]:leading-[1.85]">
      <div>
        <div className={ui.eyebrow}>AI 阅读工作台 · 由你的资料驱动</div>
        <h1>把今天的文章，变成可追溯的洞见。</h1>
        <p>选择日期与模型，确认输入上下文，再生成一份带来源快照的技术日报。</p>
      </div>
      <div className="hidden shrink-0 items-center gap-2 rounded-full border border-[#d8cdbb] bg-paper px-3.5 py-2 text-[10px] font-semibold tracking-[1.4px] text-[#7b6b54] min-[801px]:flex">
        <span className="relative flex size-6 items-center justify-center rounded-full bg-[#f1e5dc] text-primary">
          <Sparkles aria-hidden="true" size={13} />
          <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[#6f8357]" />
        </span>
        LOCAL AI WORKFLOW
      </div>
    </div>

    <div className="mb-6.25 grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-paper shadow-[0_2px_8px_#4b371204] max-[640px]:mb-5 max-[640px]:grid-cols-1">
      <div className="flex min-w-0 items-center gap-3.5 border-r border-border px-5 py-4 max-[800px]:gap-2.5 max-[800px]:px-3.5 max-[640px]:border-b max-[640px]:border-r-0 max-[640px]:px-4.5">
        <Rss aria-hidden="true" className="size-5 shrink-0 text-[#9c8f79]" />
        <span className="min-w-0 text-[10px] text-muted-foreground">知识来源<strong className="mt-0.5 block text-[18px] font-semibold leading-tight text-foreground">{state.feeds.length}<small className="ml-1 font-sans text-[10px] font-normal text-muted-foreground">个订阅</small></strong></span>
      </div>
      <div className="flex min-w-0 items-center gap-3.5 border-r border-border px-5 py-4 max-[800px]:gap-2.5 max-[800px]:px-3.5 max-[640px]:border-b max-[640px]:border-r-0 max-[640px]:px-4.5">
        <BookOpen aria-hidden="true" className="size-5 shrink-0 text-[#9c8f79]" />
        <span className="min-w-0 text-[10px] text-muted-foreground">本次上下文<strong className="mt-0.5 block text-[18px] font-semibold leading-tight text-foreground">{visibleArticles.length}<small className="ml-1 font-sans text-[10px] font-normal text-muted-foreground">篇文章{state.articles.length === 500 ? '（窗口内）' : ''}</small></strong></span>
      </div>
      <div className="flex min-w-0 items-center gap-3.5 px-5 py-4 max-[800px]:gap-2.5 max-[800px]:px-3.5 max-[640px]:px-4.5">
        <FileText aria-hidden="true" className="size-5 shrink-0 text-[#9c8f79]" />
        <span className="min-w-0 text-[10px] text-muted-foreground">AI 输出<strong className="mt-0.5 block text-[18px] font-semibold leading-tight text-foreground">{state.digests.length}<small className="ml-1 font-sans text-[10px] font-normal text-muted-foreground">份归档</small></strong></span>
      </div>
    </div>

    <div className="grid items-start gap-6.25 min-[1280px]:grid-cols-[minmax(0,1fr)_21.5rem]">
      <aside className="min-w-0 min-[1280px]:sticky min-[1280px]:top-5 min-[1280px]:col-start-2 min-[1280px]:row-start-1" aria-label="日报生成选项">
        <Card className="gap-0 overflow-hidden border-[#d8d1c3] py-0 shadow-[0_10px_30px_#4b37120a]" aria-busy={generating}>
          <form onSubmit={generate}>
            <div className="flex items-start justify-between gap-3 border-b border-border bg-[#fbf8f1] px-5 py-4.5 max-[640px]:px-4.5">
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_5px_14px_#a8482d26]">
                  <Sparkles aria-hidden="true" size={17} />
                </span>
                <div className="min-w-0">
                  <h2 className="font-serif text-[19px] font-semibold leading-tight">AI 日报生成器</h2>
                  <p className="mt-1 text-[10px] leading-[1.6] text-muted-foreground">设置本次生成使用的上下文。</p>
                </div>
              </div>
              <Badge className="shrink-0" variant={generating ? 'outline' : 'secondary'}>
                {generating ? <LoaderCircle aria-hidden="true" className="animate-spin" size={12} /> : <span aria-hidden="true" className="size-1.5 rounded-full bg-[#6f8357]" />}
                {generating ? '生成中' : '等待指令'}
              </Badge>
            </div>

            <div className="grid gap-4.5 px-5 py-5 max-[640px]:px-4.5 max-[640px]:py-4.5">
              <div className="grid gap-4 min-[700px]:grid-cols-2 min-[1280px]:grid-cols-1">
                <div className="grid min-w-0 gap-2 [&_[data-slot=label]]:text-[12px]">
                  <Label htmlFor="digest-date">日报日期</Label>
                  <Input id="digest-date" type="date" required value={date} onChange={event => setDate(event.target.value)} disabled={!!busy} aria-describedby="digest-date-help" />
                  <span id="digest-date-help" className="text-[10px] text-muted-foreground">按本地时区 {timezone} 读取当天缓存。</span>
                </div>
                <div className="grid min-w-0 gap-2 [&_[data-slot=label]]:text-[12px]">
                  <Label htmlFor="digest-model">模型</Label>
                  <select id="digest-model" className="h-10 min-w-0 rounded-md border border-input bg-paper px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={activeProviderModelId} disabled={!!busy} onChange={event => setProviderModelId(event.target.value)} aria-describedby="digest-model-help">
                    <option value="">请选择连接与模型</option>
                    {state.providers.filter(item => item.enabled).map(item => <optgroup key={item.id} label={item.name}>
                      {item.models.filter(model => model.enabled).map(model => <option key={model.id} value={model.id}>{model.displayName || model.modelId}</option>)}
                    </optgroup>)}
                  </select>
                  <span id="digest-model-help" className="text-[10px] text-muted-foreground">生成开始时冻结选择。</span>
                </div>
              </div>

              <div className="grid gap-2.5 min-[900px]:grid-cols-3 min-[1280px]:grid-cols-1" aria-label="本次生成上下文">
                <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[#e6dfd2] bg-[#f7f3ea] px-3.5 py-3">
                  <Database aria-hidden="true" className="size-4 shrink-0 text-[#9b8060]" />
                  <span className="min-w-0 text-[10px] text-muted-foreground"><strong className="block text-[11px] font-semibold text-foreground">{visibleArticles.length} 篇缓存文章</strong>不会自动刷新来源</span>
                </div>
                <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[#e6dfd2] bg-[#f7f3ea] px-3.5 py-3">
                  <Layers3 aria-hidden="true" className="size-4 shrink-0 text-[#9b8060]" />
                  <span className="min-w-0 text-[10px] text-muted-foreground"><strong className="block text-[11px] font-semibold text-foreground">{templateLabel}</strong>控制结构与写作要求</span>
                </div>
                <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[#e6dfd2] bg-[#f7f3ea] px-3.5 py-3">
                  {selectedModel ? <ProviderIcon presetId={selectedModel.provider.presetId} size={16} /> : <Settings2 aria-hidden="true" className="size-4 shrink-0 text-[#9b8060]" />}
                  <span className="min-w-0 text-[10px] text-muted-foreground"><strong className="block truncate text-[11px] font-semibold text-foreground" title={selectedModelName}>{selectedModelName}</strong><span className="block truncate" title={selectedModelContext}>{selectedModelContext}</span></span>
                </div>
              </div>

              <Task key={generation?.sessionId ?? (generating ? 'running' : 'idle')} defaultOpen={generating || Boolean(generationEvents.length)} className="rounded-lg border border-[#e0d7c8] bg-paper px-4.25">
                <div aria-live="polite" aria-atomic="true">
                  <TaskTrigger title={
                    latestGenerationEvent
                      ? generationEventLabel(latestGenerationEvent)
                      : generating
                        ? '正在连接本地生成队列'
                        : '查看生成流程与数据边界'
                  } />
                </div>
                <TaskContent className="pb-4">
                  {generation ? generationEvents.length ? generationEvents.map((item, index) => {
                    const current = generating && index === generationEvents.length - 1
                    const failed = item.type === 'failed'
                    return <TaskItem key={item.id} className={`flex min-h-7 items-start gap-2.5 text-[11px] ${failed ? 'text-destructive' : ''}`}>
                      {current
                        ? <LoaderCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 animate-spin text-primary" />
                        : failed
                          ? <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                          : <Check aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-[#6f8357]" />}
                      <span>{generationEventLabel(item)}</span>
                    </TaskItem>
                  }) : <TaskItem className="flex min-h-7 items-center gap-2.5 text-[11px]"><LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-primary" />等待本地队列返回首个事件</TaskItem> : <>
                    <TaskItem className="flex min-h-7 items-center gap-2.5 text-[11px]"><Database aria-hidden="true" className="size-3.5 shrink-0 text-[#a07c57]" />读取 {date ? formatDate(date) : '所选日期'} 的缓存文章</TaskItem>
                    <TaskItem className="flex min-h-7 items-center gap-2.5 text-[11px]"><Sparkles aria-hidden="true" className="size-3.5 shrink-0 text-[#a07c57]" />按当前模板提炼主题、事实与脉络</TaskItem>
                    <TaskItem className="flex min-h-7 items-center gap-2.5 text-[11px]"><FileText aria-hidden="true" className="size-3.5 shrink-0 text-[#a07c57]" />成功后自动保存新版本和来源快照</TaskItem>
                  </>}
                  {generating && <p className="mt-3 flex items-start gap-2 rounded-md bg-[#f4eadf] px-3 py-2.5 text-[10px] leading-[1.7] text-[#795c3e]" role="status"><span className="mt-1 size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />这些状态来自本地 SQLite 事件队列。离开当前页面不会取消后台生成，返回后会从已保存的事件继续显示。</p>}
                </TaskContent>
              </Task>

              <p className="quiet-note text-[10px] leading-[1.8] text-muted-foreground wrap-anywhere">文章与 API Key 将发送至 <strong>{providerHost ?? '所选服务商'}</strong>。单日最多 500 篇、30 万字符；超限会在调用前拒绝，失败不会覆盖旧版。</p>

              {selectedModel && !selectedModel.provider.hasCredential && <p className="flex min-h-11 items-center gap-2 rounded-md border border-[#ead9bb] bg-[#fbf4e5] px-3.5 text-[11px] text-[#7b5c2e]"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />所选连接缺少 API Key。请先在 <button type="button" className="font-semibold underline underline-offset-3" onClick={() => navigate('settings')}>模型与服务商</button> 中保存。</p>}
              {!selectedModel && <p className="flex min-h-11 items-center gap-2 rounded-md border border-[#ead9bb] bg-[#fbf4e5] px-3.5 text-[11px] text-[#7b5c2e]"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />生成前，请选择一个已启用的连接与模型。</p>}
              {definitelyEmpty && state.feeds.length > 0 && <p className="flex min-h-11 items-center gap-2 rounded-md border border-[#ead9bb] bg-[#fbf4e5] px-3.5 text-[11px] text-[#7b5c2e]"><CircleAlert aria-hidden="true" className="size-4 shrink-0" />所选日期没有可总结的文章。请刷新订阅或选择其他日期。</p>}

              <div className="grid gap-3 border-t border-border pt-4.5">
                <div className="grid grid-cols-2 gap-2.25 [&_button]:w-full">
                  <Button type="button" variant="outline" size="lg" disabled={!!busy || !state.feeds.length} onClick={refresh}><RefreshCw aria-hidden="true" className={busy === '刷新订阅' ? 'animate-spin' : ''} />刷新订阅</Button>
                  <Button type="submit" size="lg" disabled={!canGenerate} className="shadow-[0_5px_14px_#a8482d20]">
                    {generating ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />}
                    {generating ? '正在生成' : report ? '重新生成一版' : '生成日报'}
                  </Button>
                </div>
                <button type="button" className="inline-flex min-h-8 items-center justify-center gap-1.5 text-[11px] font-medium text-primary hover:underline hover:underline-offset-3" onClick={() => navigate('settings')}>管理模型连接 <ArrowRight aria-hidden="true" size={13} /></button>
              </div>
            </div>
          </form>
        </Card>

        {(failed.length > 0 || stale.length > 0) && <div className="warning mt-4 rounded-[7px] border border-[#e8d8b2] bg-[#f7efdc] px-4 py-3.5 text-[11px] leading-[1.8] text-[#826426] wrap-anywhere [&_details]:mt-1.5 [&_ul]:mx-0 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          <p>{failed.length > 0 ? `${failed.length} 个来源最近获取失败，现有缓存仍可用于生成，信息可能不完整。` : '部分来源超过 24 小时未更新，建议先刷新再生成。'}</p>
          <details><summary>查看来源状态</summary><ul>{state.feeds.filter(feed => failed.includes(feed) || stale.includes(feed)).map(feed => <li key={feed.id}><strong>{feed.title}</strong>：{feed.error || '缓存可能已过时'}；{feed.lastFetchedAt ? `上次成功 ${formatDate(feed.lastFetchedAt, true)}` : '尚无成功获取记录'}</li>)}</ul></details>
        </div>}
      </aside>

      <section className="min-w-0 min-[1280px]:col-start-1 min-[1280px]:row-start-1" aria-labelledby="ai-output-title">
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-7.5 shrink-0 place-items-center rounded-lg bg-[#efe3d8] text-primary"><Sparkles aria-hidden="true" size={14} /></span>
            <div><div className="text-[9px] font-semibold tracking-[1.6px] text-primary">DOCUMENT PREVIEW</div><h2 id="ai-output-title" className="font-serif text-[20px] font-semibold">{report ? '最新生成结果' : '等待生成'}</h2></div>
          </div>
          {report && <Badge variant="secondary">来源可追溯</Badge>}
        </div>

        {report ? <Report digest={report} /> : <div className="relative overflow-hidden rounded-xl border border-[#dcd4c6] bg-paper px-8.75 py-9 text-center shadow-[0_8px_24px_#46371008] max-[800px]:px-5.5 max-[640px]:px-4.5 max-[640px]:py-7">
          <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-80 -translate-x-1/2 rounded-full bg-[#efe4d7] opacity-55 blur-3xl" aria-hidden="true" />
          <div className="relative mx-auto mb-4.5 grid size-14 place-items-center rounded-2xl border border-[#ded0bd] bg-[#faf5ec] text-primary shadow-[0_6px_18px_#59341410]">
            <Sparkles aria-hidden="true" size={24} />
            <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-paper bg-[#6f8357]" />
          </div>
          <h3 className="relative font-serif text-[25px] font-medium tracking-[-.5px] max-[640px]:text-[22px]">{state.digests.length ? `${date ? formatDate(date) : '所选日期'}，还没有生成版本。` : '从可信上下文，生成第一份日报。'}</h3>
          <p className="relative mx-auto mt-3 max-w-145 text-[12px] leading-[1.9] text-muted-foreground max-[640px]:text-[11px]">准备好来源、模型与模板后，生成结果会连同来源快照显示在这里。</p>
          <div className="relative mt-7 grid grid-cols-3 gap-3 border-t border-border pt-6 max-[800px]:gap-2 max-[640px]:mt-5.5 max-[640px]:grid-cols-1 max-[640px]:pt-5">
            <button className={ui.onboardingStep} type="button" onClick={() => navigate('feeds')}>
              <span className={`grid size-7.5 place-items-center rounded-full bg-[#f3efe4] font-editorial text-[12px] font-normal text-[#685b49] max-[640px]:row-span-2 max-[640px]:self-center [&.complete]:bg-[#edf0e4] [&.complete]:text-[#536541] ${state.feeds.length ? 'complete' : ''}`}>{state.feeds.length ? <Check aria-hidden="true" size={17} /> : '01'}</span>
              <strong>添加可信来源 <ArrowRight aria-hidden="true" size={14} /></strong><span>RSS / Atom 或 OPML</span>
            </button>
            <button className={ui.onboardingStep} type="button" onClick={() => navigate('settings')}>
              <span className={`grid size-7.5 place-items-center rounded-full bg-[#f3efe4] font-editorial text-[12px] font-normal text-[#685b49] max-[640px]:row-span-2 max-[640px]:self-center [&.complete]:bg-[#edf0e4] [&.complete]:text-[#536541] ${state.hasApiKey ? 'complete' : ''}`}>{state.hasApiKey ? <Check aria-hidden="true" size={17} /> : '02'}</span>
              <strong>连接 AI 模型 <ArrowRight aria-hidden="true" size={14} /></strong><span>密钥只保存在本地</span>
            </button>
            <button className={ui.onboardingStep} type="button" onClick={() => navigate('template')}>
              <span className="grid size-7.5 place-items-center rounded-full bg-[#f3efe4] font-editorial text-[12px] font-normal text-[#685b49] max-[640px]:row-span-2 max-[640px]:self-center">03</span>
              <strong>定义日报模板 <ArrowRight aria-hidden="true" size={14} /></strong><span>告诉 AI 如何整理</span>
            </button>
          </div>
        </div>}
      </section>
    </div>
  </>
}
