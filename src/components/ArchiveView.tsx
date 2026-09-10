import { ui } from "../lib/ui-styles"
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
    <div className={ui.viewHeading}><div><div className={ui.eyebrow}>阅读留痕 · 每一版都值得保存</div><h1>把今天，留给未来。</h1><p>按生成时间倒序保存。模板与订阅的变化，不会改写已经归档的日报。</p></div><Badge variant="outline">{digests.length} 份归档</Badge></div>
    {selected ? <><div className="flex items-center justify-between flex-wrap gap-3 mt-6.5 mx-0 mb-4.25 max-[640px]:mt-5.5 max-[640px]:[&_>_.button-row]:gap-0.5 max-[640px]:[&_button]:text-[11px]"><Button variant="ghost" onClick={() => setSelectedId(null)}><ArrowLeft />返回归档列表</Button><Button variant="outline" disabled={!!busy} onClick={() => setDeleting(selected)}><Trash2 />删除此版本</Button></div><Report digest={selected} /></> : digests.length ? <div className="grid gap-3.25">{digests.map(digest => <Card className="flex-row items-center gap-5.75 p-6 shadow-none max-[640px]:py-4.75 max-[640px]:px-3.75 max-[640px]:gap-3.75 max-[640px]:[&_>_button:last-child]:w-6.5" key={digest.id}><div className="w-18.75 shrink-0 flex flex-col items-center pr-5.5 border-r border-r-border [&_strong]:font-editorial [&_strong]:text-[#9b6b49] [&_strong]:font-normal [&_strong]:text-[32px] [&_strong]:leading-[1.3] [&_span]:text-[#968976] [&_span]:text-[9px] [&_span]:whitespace-nowrap max-[640px]:w-14 max-[640px]:pr-3.5 max-[640px]:[&_strong]:text-[28px] max-[640px]:[&_span]:text-[8px]"><strong>{digest.date.slice(8)}</strong><span>{digest.date.slice(0, 7).replace('-', ' / ')}</span></div><button className="flex-1 text-left min-w-0 bg-transparent border-0 [&_h2]:font-serif [&_h2]:font-medium [&_h2]:text-[22px] [&_h2]:wrap-anywhere [&_h2_svg]:inline [&_h2_svg]:ml-2.25 [&_h2_svg]:text-[#a2957a] [&:hover_h2]:text-primary [&_p]:text-[11px] [&_p]:text-[#837a69] [&_p]:mt-1.5 [&_p]:mx-0 [&_p]:mb-0.75 [&_p]:wrap-anywhere [&_>_span]:text-[10px] [&_>_span]:text-[#9d9381] max-[640px]:[&_h2]:text-[19px] max-[640px]:[&_h2_svg]:w-3.25 max-[640px]:[&_h2_svg]:ml-1 max-[640px]:[&_p]:text-[10px] max-[640px]:[&_>_span]:text-[9px]" onClick={() => setSelectedId(digest.id)}><h2>{digest.title}<ArrowUpRight size={18} /></h2><p>{digest.articleCount} 篇参考文章 · {digest.model}{digest.providerName ? ` · ${digest.providerName}` : ''}</p><span>生成于 {formatDate(digest.createdAt, true)}</span></button><Button variant="ghost" size="icon" disabled={!!busy} aria-label={`删除 ${digest.title}，生成于 ${formatDate(digest.createdAt, true)}`} onClick={() => setDeleting(digest)}><Trash2 size={16} /></Button></Card>)}</div> : <div className={ui.emptyState}><Archive size={32} strokeWidth={1.3} /><h3>时间会留下值得回看的东西。</h3><p>完整生成的日报会自动归档在这里。同一天可以保留多个版本。</p><Button onClick={() => navigate('today')}>去生成第一份日报</Button></div>}
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null) }}><DialogContent showCloseButton={false}><DialogHeader><DialogTitle>删除这份日报？</DialogTitle><DialogDescription>将永久删除「{deleting?.title}」在 {deleting ? formatDate(deleting.createdAt, true) : ''} 生成的版本及其来源快照。其他版本、订阅与文章不会受影响。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={!!busy} onClick={() => setDeleting(null)}>保留日报</Button><Button variant="destructive" disabled={!!busy} onClick={() => void remove()}>确认删除</Button></DialogFooter></DialogContent></Dialog>
  </>
}
