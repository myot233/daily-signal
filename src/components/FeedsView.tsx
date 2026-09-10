import { useRef, useState } from 'react'
import { ArrowUpRight, Check, Download, LoaderCircle, Plus, RefreshCw, Rss, Trash2, Upload } from 'lucide-react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { rpc, download, formatDate, safeUrl, type ViewProps } from '../lib/client'
import { addFeedSchema, importOpmlSchema, type Feed, type ImportResult } from '../../shared/types'

const recommended = [
  { title: 'Hacker News', category: '技术社区', url: 'https://hnrss.org/frontpage', description: '开发者社区的热门讨论与新发现' },
  { title: '阮一峰的网络日志', category: '科技周刊', url: 'https://www.ruanyifeng.com/blog/atom.xml', description: '技术、思考与每周值得关注的事' },
  { title: 'Simon Willison', category: '人工智能', url: 'https://simonwillison.net/atom/everything/', description: '来自实践一线的 AI 与开源观察' },
]

export function FeedsView({ state, busy, perform, notify, refresh }: ViewProps & { refresh: () => void }) {
  const [adding, setAdding] = useState(false)
  const [url, setUrl] = useState('')
  const [category, setCategory] = useState('')
  const [deleting, setDeleting] = useState<Feed | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  async function addFeed(feedUrl = url, feedCategory = category) {
    const done = await perform('添加订阅源', async () => { await rpc.feeds.add(addFeedSchema.parse({ url: feedUrl, category: feedCategory })) }, '已添加并获取文章。')
    if (done) { setAdding(false); setUrl(''); setCategory('') }
  }
  async function importFile(file?: File) {
    if (!file) return
    setImportResult(null)
    await perform('导入 OPML', async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error('OPML 文件不能超过 2 MiB。')
      const result = await rpc.feeds.import(importOpmlSchema.parse({ opml: await file.text() }))
      setImportResult(result)
      notify({ kind: result.errors.length ? 'warning' : 'success', message: `导入完成：新增 ${result.imported} 个，跳过 ${result.skipped} 个，失败 ${result.errors.length} 个。` })
    })
  }
  return <>
    <div className="view-heading"><div><div className="eyebrow">我的信息来源</div><h1>好的日报，从好的来源开始。</h1><p>订阅你信任的声音，让每一次阅读都有所收获。</p></div><Button disabled={!!busy} onClick={() => setAdding(true)}><Plus />添加订阅源</Button></div>
    <div className="section-toolbar">
      <span className="section-label">我的订阅 <Badge variant="secondary">{state.feeds.length}</Badge></span>
      <div className="button-row">
        <input ref={fileInput} type="file" accept=".opml,.xml,text/xml,application/xml" className="sr-only" aria-label="导入 OPML 文件" disabled={!!busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importFile(file) }} />
        <Button variant="ghost" size="sm" disabled={!!busy} onClick={() => fileInput.current?.click()}><Upload />导入 OPML</Button>
        <Button variant="ghost" size="sm" disabled={!!busy || !state.feeds.length} onClick={() => void perform('导出 OPML', async () => {
          const { opml } = await rpc.feeds.export()
          download(opml, 'daily-signal-feeds.opml', 'application/xml;charset=utf-8')
        }, '订阅列表已导出。')}><Download />导出</Button>
        <Button variant="outline" size="sm" disabled={!!busy || !state.feeds.length} onClick={refresh}><RefreshCw className={busy === '刷新订阅' ? 'spin' : ''} />刷新订阅</Button>
      </div>
    </div>
    {importResult && <div className={`inline-notice ${importResult.errors.length ? 'warning' : 'success'}`}><p>OPML 导入结果：新增 {importResult.imported} 个 · 跳过 {importResult.skipped} 个 · 失败 {importResult.errors.length} 个</p>{importResult.errors.length > 0 && <ul>{importResult.errors.map((item, index) => <li key={index}><strong>{item.url || '未知订阅源'}</strong>：{item.error}</li>)}</ul>}</div>}
    {state.feeds.length ? <div className="feed-list">{state.feeds.map(feed => <Card className="feed-row" key={feed.id}><div className={`feed-icon ${feed.error ? 'has-error' : ''}`}><Rss size={20} /></div><div className="feed-info"><div className="feed-title"><h3>{feed.title}</h3><Badge variant="outline">{feed.category || '未分类'}</Badge></div><a className="feed-url" href={safeUrl(feed.url)} target="_blank" rel="noopener noreferrer">{feed.url}<ArrowUpRight size={12} /></a>{feed.error ? <p className="feed-error">刷新失败：{feed.error}</p> : <p className="feed-timestamp">{feed.lastFetchedAt ? `上次更新 ${formatDate(feed.lastFetchedAt, true)}` : '尚未刷新，等待获取文章'}</p>}</div><div className="feed-count"><strong>{feed.articleCount}</strong><span>篇文章</span></div><Button variant="ghost" size="icon" aria-label={`删除 ${feed.title}`} disabled={!!busy} onClick={() => setDeleting(feed)}><Trash2 size={16} /></Button></Card>)}</div> : <div className="empty-list"><Rss size={30} strokeWidth={1.3} /><h3>把你关注的世界，订阅进来。</h3><p>添加 RSS / Atom 链接，或从阅读器导入 OPML 文件。<br />下方也有几个值得一读的起点。</p><Button variant="outline" onClick={() => setAdding(true)} disabled={!!busy}><Plus />添加第一个订阅源</Button></div>}
    <section className="recommendations"><div className="section-heading"><h2>从这些声音开始</h2><span>精选推荐 · 按需添加</span></div><div className="recommend-grid">{recommended.map(feed => { const subscribed = state.feeds.some(item => item.url === feed.url); return <Card key={feed.url} className="recommend-card"><span className="eyebrow">{feed.category}</span><h3>{feed.title}</h3><p>{feed.description}</p><Button variant="ghost" disabled={!!busy || subscribed} onClick={() => void addFeed(feed.url, feed.category)}>{subscribed ? <Check /> : <Plus />}{subscribed ? '已订阅' : '添加订阅'}</Button></Card> })}</div><p className="quiet-note">推荐链接连接真实公开站点，不会自动添加。可用性取决于来源站点与网络。</p></section>
    <Dialog open={adding} onOpenChange={open => { if (!busy) setAdding(open) }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader><DialogTitle>添加一个值得关注的来源</DialogTitle><DialogDescription>支持公开的 RSS 与 Atom 订阅地址。添加时会验证来源并获取文章。</DialogDescription></DialogHeader>
        <form onSubmit={event => { event.preventDefault(); void addFeed() }} className="stack-form">
          <div className="field"><Label htmlFor="feed-url">订阅地址</Label><Input id="feed-url" type="url" required maxLength={8192} placeholder="https://example.com/feed.xml" value={url} onChange={event => setUrl(event.target.value)} disabled={!!busy} /></div>
          <div className="field"><Label htmlFor="feed-category">分类 <span className="muted">（可选）</span></Label><Input id="feed-category" maxLength={200} placeholder="例如：人工智能、工程实践" value={category} onChange={event => setCategory(event.target.value)} disabled={!!busy} /></div>
          <DialogFooter><Button type="button" variant="outline" disabled={!!busy} onClick={() => setAdding(false)}>取消</Button><Button type="submit" disabled={!!busy || !url.trim()}>{busy ? <LoaderCircle className="spin" /> : <Plus />}添加订阅</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null) }}>
      <DialogContent showCloseButton={false}>
        <DialogHeader><DialogTitle>删除这个订阅源？</DialogTitle><DialogDescription>「{deleting?.title}」及其已缓存文章将被删除。已归档日报及其来源快照会保留。此操作不可撤销。</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" disabled={!!busy} onClick={() => setDeleting(null)}>保留订阅</Button><Button variant="destructive" disabled={!!busy} onClick={() => void (async () => { if (deleting && await perform('删除订阅源', async () => { await rpc.feeds.remove({ id: deleting.id }) }, '订阅源已删除。')) setDeleting(null) })()}>确认删除</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
