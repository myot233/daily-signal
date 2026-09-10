import { useEffect, useState } from 'react'
import { Check, Circle, CircleAlert, Globe, LoaderCircle } from 'lucide-react'
import type { GenerationProgress } from '../../shared/progress'
import type { GenerationRun } from '../lib/state'
import { safeUrl } from '../lib/client'
import { Card } from './ui/card'

const phases = [
  ['prepare', '读取资料'], ['template', '准备模板'], ['extract', '整理资料'], ['synthesize', '合成日报'], ['archive', '归档'],
] as const

export function GenerationTimeline({ events, running = false, failed = false }: { events: GenerationProgress[]; running?: boolean; failed?: boolean }) {
  return <>
    <ol className="generation-phases" aria-label="日报生成阶段">{phases.map(([id, label]) => {
      const event = events.find(item => item.id === id)
      const status = failed && event?.status === 'running' ? 'error' : event?.status ?? 'pending'
      return <li key={id} className={`phase-${status}`}>{status === 'success' ? <Check size={13} /> : status === 'running' && running ? <LoaderCircle size={13} className="spin" /> : status === 'error' ? <CircleAlert size={13} /> : <Circle size={13} />}<span>{label}</span></li>
    })}</ol>
    <ol className="generation-events" aria-label="Agent 执行记录">{events.map(event => {
      const pending = event.status === 'running' || event.status === 'queued'
      const status = pending && failed ? 'error' : event.status
      return <li key={event.id} className={`event-${status}`}>
        <span className="event-icon">{pending && running ? <LoaderCircle size={15} className="spin" /> : status === 'success' ? <Check size={15} /> : status === 'error' ? <CircleAlert size={15} /> : event.kind === 'webfetch' ? <Globe size={15} /> : <Circle size={15} />}</span>
        <div><p>{pending && failed ? `已中断：${event.message}` : event.message}</p>{event.title && <span className="event-source">{safeUrl(event.url) ? <a href={safeUrl(event.url)} target="_blank" rel="noopener noreferrer">{event.title}</a> : event.title}</span>}{event.url && <span className="event-url">{event.url}</span>}</div>
        <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString('zh-CN', { hour12: false })}</time>
      </li>
    })}</ol>
  </>
}

export function GenerationPanel({ run }: { run: GenerationRun }) {
  const [now, setNow] = useState(Date.now)
  const running = run.status === 'running'
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [running])
  const elapsed = Math.max(0, Math.floor(((run.finishedAt ?? now) - run.startedAt) / 1000))
  const models = run.events.filter(event => event.kind === 'model').length
  const pages = run.events.filter(event => event.kind === 'webfetch' && event.status === 'success').length
  const failures = run.events.filter(event => event.kind === 'webfetch' && event.status === 'error').length
  const latest = [...run.events].sort((a, b) => b.at.localeCompare(a.at))[0]
  const summary = running ? run.current ?? latest?.message ?? '正在连接生成服务…' : run.status === 'complete' ? '日报与生成记录已归档' : run.error ?? '生成已中断'
  return <Card className="generation-progress">
    <div className="progress-heading"><div><div className="eyebrow">AGENT · {run.date}</div><h2>{running ? '正在为你整理日报' : run.status === 'complete' ? '本次生成已完成' : '本次生成未完成'}</h2></div><span className="progress-elapsed">{Math.floor(elapsed / 60)} 分 {elapsed % 60} 秒</span></div>
    <p className={`progress-current ${run.status === 'failed' ? 'progress-error' : ''}`} role="status">{running && <LoaderCircle size={15} className="spin" />}{summary}</p>
    <div className="progress-counts"><span>模型调用 <strong>{models}</strong> 次</span><span>网页读取 <strong>{pages}</strong> 页</span>{failures > 0 && <span>回退摘要 <strong>{failures}</strong> 页</span>}</div>
    <details open={running}><summary>查看执行过程</summary><GenerationTimeline events={run.events} running={running} failed={run.status === 'failed'} /></details>
  </Card>
}
