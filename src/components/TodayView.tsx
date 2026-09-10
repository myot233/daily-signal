import { useEffect, useState } from 'react'
import { ArrowRight, BookOpen, Check, FileText, RefreshCw, Rss, Settings2, Sparkles } from 'lucide-react'
import { digestInputSchema } from '../../shared/types'
import { dayBounds, formatDate, localDate, rpc } from '../lib/client'
import type { View, ViewProps } from '../lib/client'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Report } from './Report'

export function TodayView({ state, busy, perform, apiKey, navigate, refresh }: ViewProps & { apiKey: string; navigate: (view: View) => void; refresh: () => void }) {
  const [date, setDate] = useState(localDate)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const report = state.digests.filter(item => item.date === date).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const bounds = date ? dayBounds(date) : null
  const visibleArticles = bounds ? state.articles.filter(article => article.publishedAt >= bounds.startAt && article.publishedAt < bounds.endAt) : []
  const failed = state.feeds.filter(feed => feed.error)
  const stale = state.feeds.filter(feed => !feed.lastFetchedAt || now - Date.parse(feed.lastFetchedAt) > 24 * 60 * 60 * 1000)
  const definitelyEmpty = state.articles.length < 500 && visibleArticles.length === 0
  const provider = new URL(state.settings.baseUrl).hostname

  function generate() {
    void perform('生成日报', async () => {
      const input = digestInputSchema.parse({ date, ...dayBounds(date), apiKey })
      await rpc.digests.generate(input)
    }, '日报已生成并归档。重要信息请通过原文核实。')
  }

  return <>
    <div className="view-heading today-heading"><div><div className="eyebrow">每日一读 · 保持好奇</div><h1>看见变化，读懂意义。</h1><p>从你信任的来源出发，整理一份值得认真阅读的技术日报。</p></div><div className="edition-mark" aria-hidden="true"><span>你的</span><strong>每日信号</strong><span>技术 · 观察 · 思考</span></div></div>
    <div className="overview-strip"><div><Rss /><span>订阅来源<strong>{state.feeds.length}<small> 个</small></strong></span></div><div><BookOpen /><span>当日可见文章<strong>{visibleArticles.length}<small> 篇{state.articles.length === 500 ? '（窗口内）' : ''}</small></strong></span></div><div><FileText /><span>已归档日报<strong>{state.digests.length}<small> 份</small></strong></span></div></div>
    <Card className="generation-panel">
      <div className="generation-controls"><div className="field date-field"><Label htmlFor="digest-date">阅读哪一天</Label><Input id="digest-date" type="date" required value={date} onChange={event => setDate(event.target.value)} disabled={!!busy} /><span className="field-hint">本地时区：{timezone}</span></div><div className="generation-actions"><Button variant="outline" disabled={!!busy || !state.feeds.length} onClick={refresh}><RefreshCw className={busy === '刷新订阅' ? 'spin' : ''} />刷新订阅</Button><Button disabled={!!busy || !date || !apiKey.trim() || !state.feeds.length || definitelyEmpty} onClick={generate}><Sparkles />{report ? '重新生成一版' : '生成日报'}</Button></div></div>
      <div className="generation-caption"><span><Badge variant="secondary">{state.settings.model}</Badge>{provider === 'api.deepseek.com' && <Badge variant="outline">DeepSeek 思考：{state.settings.deepseekThinking === 'enabled' ? '已开启' : '已关闭'}</Badge>} 使用已保存的模型与模板</span><button className="text-link" onClick={() => navigate('settings')}>调整设置 <ArrowRight size={13} /></button></div>
      <p className="quiet-note">仅总结已缓存文章，不会自动刷新。文章内容与临时 Key 将发送至 <strong>{provider}</strong>。单日去重后最多 500 篇、输入最多 30 万字符；超过限制会在付费调用前拒绝，较多文章可能分批、多次计费。生成失败保留旧版。</p>
      {!apiKey.trim() && <p className="action-hint"><Settings2 size={15} />生成前，请先在 <button className="text-link" onClick={() => navigate('settings')}>AI 设置</button> 中填写临时 API Key。</p>}
      {definitelyEmpty && state.feeds.length > 0 && <p className="action-hint">所选日期没有可总结的文章。请刷新订阅或选择其他日期；订阅只提供其当前公开的文章。</p>}
    </Card>
    {(failed.length > 0 || stale.length > 0) && <div className="inline-notice warning"><p>{failed.length > 0 ? `${failed.length} 个来源最近获取失败，现有缓存仍可用于生成，信息可能不完整。` : '部分来源超过 24 小时未更新，建议先刷新再生成。'}</p><details><summary>查看来源状态</summary><ul>{state.feeds.filter(feed => failed.includes(feed) || stale.includes(feed)).map(feed => <li key={feed.id}><strong>{feed.title}</strong>：{feed.error || '缓存可能已过时'}；{feed.lastFetchedAt ? `上次成功 ${formatDate(feed.lastFetchedAt, true)}` : '尚无成功获取记录'}</li>)}</ul></details></div>}
    {report ? <Report digest={report} /> : <section className="welcome-paper">
      <div className="paper-kicker"><span />为重要的信息，留一页纸<span /></div>
      <div className="welcome-symbol"><NewspaperIllustration /></div>
      <h2>{state.digests.length ? `${date ? formatDate(date) : '所选日期'}，等待你的第一版。` : '你的第一份日报，从这里开始。'}</h2>
      <p>不是更多的信息，而是更清晰的脉络。<br />选择来源、连接模型，让零散的文章成为有价值的每日阅读。</p>
      <div className="onboarding-grid">
        <button className="onboarding-step" onClick={() => navigate('feeds')}><span className={`step-number ${state.feeds.length ? 'complete' : ''}`}>{state.feeds.length ? <Check size={17} /> : '01'}</span><strong>添加你的来源 <ArrowRight size={14} /></strong><span>RSS / Atom 或 OPML 导入</span></button>
        <button className="onboarding-step" onClick={() => navigate('settings')}><span className={`step-number ${apiKey.trim() ? 'complete' : ''}`}>{apiKey.trim() ? <Check size={17} /> : '02'}</span><strong>连接 AI 模型 <ArrowRight size={14} /></strong><span>使用自己的 Key，不保存密钥</span></button>
        <button className="onboarding-step" onClick={() => navigate('template')}><span className="step-number">03</span><strong>让日报更像你 <ArrowRight size={14} /></strong><span>可直接使用默认模板，或自定义</span></button>
      </div>
      <p className="quiet-note">完成后，使用上方「生成日报」。没有自动任务，也没有预先生成的示例报告。</p>
    </section>}
  </>
}

function NewspaperIllustration() {
  return <svg width="106" height="86" viewBox="0 0 106 86" fill="none" aria-hidden="true"><path d="M18 13h65v61H18z" fill="var(--paper)" stroke="currentColor" /><path d="M83 24h9v44a6 6 0 0 1-6 6H23" stroke="currentColor" /><path d="M29 25h42M29 30h27M29 54h18M29 60h18M29 66h42M55 41h16M55 47h16M55 54h16M55 60h16" stroke="currentColor" opacity=".5" /><path d="M29 39h18v10H29z" fill="var(--primary)" opacity=".7" /><circle cx="85" cy="12" r="9" fill="var(--primary)" /><path d="m81 12 3 3 5-6" stroke="white" /></svg>
}
