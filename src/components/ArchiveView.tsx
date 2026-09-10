import { useState } from 'react'
import { Archive, ArrowLeft, ArrowUpRight, Trash2 } from 'lucide-react'
import { formatDate, rpc } from '../lib/client'
import type { View, ViewProps } from '../lib/client'
import type { Digest } from '../../shared/types'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Report } from './Report'

export function ArchiveView({ state, busy, perform, navigate }: ViewProps & { navigate: (view: View) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Digest | null>(null)
  const selected = state.digests.find(digest => digest.id === selectedId)
  const digests = [...state.digests].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  async function remove() {
    if (!deleting) return
    const id = deleting.id
    if (await perform('删除日报', async () => { await rpc.digests.remove({ id }) }, '这份日报已删除。')) {
      if (selectedId === id) setSelectedId(null)
      setDeleting(null)
    }
  }

  return <>
    <div className="view-heading"><div><div className="eyebrow">阅读留痕 · 每一版都值得保存</div><h1>把今天，留给未来。</h1><p>按生成时间倒序保存。模板与订阅的变化，不会改写已经归档的日报。</p></div><Badge variant="outline">{digests.length} 份归档</Badge></div>
    {selected ? <><div className="section-toolbar"><Button variant="ghost" onClick={() => setSelectedId(null)}><ArrowLeft />返回归档列表</Button><Button variant="outline" disabled={!!busy} onClick={() => setDeleting(selected)}><Trash2 />删除此版本</Button></div><Report digest={selected} /></> : digests.length ? <div className="archive-list">{digests.map(digest => <Card className="archive-card" key={digest.id}><div className="archive-date"><strong>{digest.date.slice(8)}</strong><span>{digest.date.slice(0, 7).replace('-', ' / ')}</span></div><button className="archive-open" onClick={() => setSelectedId(digest.id)}><h2>{digest.title}<ArrowUpRight size={18} /></h2><p>{digest.articleCount} 篇参考文章 · {digest.model}</p><span>生成于 {formatDate(digest.createdAt, true)}</span></button><Button variant="ghost" size="icon" disabled={!!busy} aria-label={`删除 ${digest.title}，生成于 ${formatDate(digest.createdAt, true)}`} onClick={() => setDeleting(digest)}><Trash2 size={16} /></Button></Card>)}</div> : <div className="empty-list"><Archive size={32} strokeWidth={1.3} /><h3>时间会留下值得回看的东西。</h3><p>完整生成的日报会自动归档在这里。同一天可以保留多个版本。</p><Button onClick={() => navigate('today')}>去生成第一份日报</Button></div>}
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null) }}><DialogContent showCloseButton={false}><DialogHeader><DialogTitle>删除这份日报？</DialogTitle><DialogDescription>将永久删除「{deleting?.title}」在 {deleting ? formatDate(deleting.createdAt, true) : ''} 生成的版本及其来源快照。其他版本、订阅与文章不会受影响。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={!!busy} onClick={() => setDeleting(null)}>保留日报</Button><Button variant="destructive" disabled={!!busy} onClick={() => void remove()}>确认删除</Button></DialogFooter></DialogContent></Dialog>
  </>
}
