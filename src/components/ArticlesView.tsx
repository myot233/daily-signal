import { ui } from "../lib/ui-styles"
import { useMemo, useState } from 'react'
import { ArrowUpRight, BookOpen, Search, X } from 'lucide-react'
import { formatDate, safeUrl } from '../lib/client'
import type { View, ViewProps } from '../lib/client'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'

export function ArticlesView({ state, navigate }: ViewProps & { navigate: (view: View) => void }) {
  const [query, setQuery] = useState('')
  const [feedId, setFeedId] = useState('')
  const selectedFeed = state.feeds.some(feed => feed.id === feedId) ? feedId : ''
  const articles = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('zh-CN')
    return state.articles.filter(article => (!selectedFeed || article.feedId === selectedFeed) && (!search || `${article.title}\n${article.content}`.toLocaleLowerCase('zh-CN').includes(search)))
  }, [state.articles, selectedFeed, query])

  return <>
    <div className={ui.viewHeading}><div><div className={ui.eyebrow}>原始阅读 · 保留上下文</div><h1>灵感，在字里行间。</h1><p>先读原文，再形成自己的判断。这里是日报背后的真实信息。</p></div></div>
    <Card className="flex flex-row items-end gap-4.5 p-5.25 shadow-none max-[800px]:flex-wrap max-[800px]:[&_.search-field]:basis-full max-[800px]:[&_>_.field:nth-child(2)]:flex-1 max-[640px]:p-4.5 max-[640px]:gap-3.75"><div className="field flex flex-col gap-2.25 min-w-0 [&_[data-slot=label]]:text-[12px] [&_[data-slot=label]]:leading-[1.6] [&_input]:bg-paper [&_textarea]:bg-paper search-field flex-1"><Label htmlFor="article-search">搜索文章</Label><div className="relative [&_svg]:absolute [&_svg]:top-2.75 [&_svg]:left-3 [&_svg]:text-[#9a9486] [&_input]:pl-9"><Search size={16} /><Input id="article-search" placeholder="搜索标题或订阅正文…" value={query} onChange={event => setQuery(event.target.value)} /></div></div><div className={ui.field}><Label htmlFor="article-feed">按来源筛选</Label><select id="article-feed" className="h-9 border border-input rounded-[6px] bg-paper text-[12px] pt-0 pr-7 pb-0 pl-2.75 w-52.5 max-w-full text-ellipsis max-[800px]:w-full" value={selectedFeed} onChange={event => setFeedId(event.target.value)}><option value="">全部来源</option>{state.feeds.map(feed => <option value={feed.id} key={feed.id}>{feed.title}</option>)}</select></div>{(query || selectedFeed) && <Button variant="ghost" onClick={() => { setQuery(''); setFeedId('') }}><X />清除筛选</Button>}</Card>
    <div className="flex items-center justify-between flex-wrap gap-3 mt-6.5 mx-0 mb-4.25 max-[640px]:mt-5.5 max-[640px]:[&_>_.button-row]:gap-0.5 max-[640px]:[&_button]:text-[11px]"><span className="inline-flex gap-2.5 items-center text-[12px] font-semibold">{articles.length} 篇符合条件</span><span className="quiet-note text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere [&_strong]:font-medium [&_strong]:text-[#655747]">仅展示最近 500 篇缓存 · 日报按整日完整查询</span></div>
    {articles.length ? <div className="grid gap-4">{articles.map(article => <Card key={article.id} className="py-6.25 px-7 shadow-none gap-3 min-w-0 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:font-medium [&_h2]:leading-[1.6] [&_h2]:wrap-anywhere [&_h2_a:hover]:text-primary [&_h2_svg]:inline [&_h2_svg]:ml-2 [&_h2_svg]:text-[#a89a80] [&_h2_svg]:align-middle max-[640px]:py-5.25 max-[640px]:px-5 max-[640px]:[&_h2]:text-[21px]"><div className="flex flex-wrap items-center gap-2.25 text-[#8d8576] text-[10px] [&_[data-slot=badge]]:whitespace-normal [&_[data-slot=badge]]:wrap-anywhere"><Badge variant="secondary">{article.feedTitle}</Badge><time dateTime={article.publishedAt}>{formatDate(article.publishedAt, true)}</time>{article.dateEstimated && <Badge variant="outline" title="来源未提供有效发布时间，使用首次发现时间，不代表当日发布。">估计日期</Badge>}</div><h2>{safeUrl(article.url) ? <a href={safeUrl(article.url)} target="_blank" rel="noopener noreferrer">{article.title}<ArrowUpRight size={17} /></a> : article.title}</h2><p className="line-clamp-3 overflow-hidden text-[#777165] text-[12px] wrap-anywhere max-[640px]:text-[11px]">{article.content || '此来源未提供正文或摘要，请打开原文阅读。'}</p><div className="flex justify-between flex-wrap gap-3 pt-1.25 text-[#a19886] text-[9px]"><span>订阅提供的正文 / 摘要，非另行抓取全文</span>{safeUrl(article.url) && <a className="text-primary inline-flex items-center gap-1.25 no-underline bg-transparent border-0 text-[12px] hover:underline hover:underline-offset-3" href={safeUrl(article.url)} target="_blank" rel="noopener noreferrer">阅读原文 <ArrowUpRight size={13} /></a>}</div></Card>)}</div> : <div className={ui.emptyState}><BookOpen size={32} strokeWidth={1.3} /><h3>{query || selectedFeed ? '这一页，暂时没有匹配的文章。' : '还没有文章，先带几个来源进来。'}</h3><p>{query || selectedFeed ? '换个关键词或清除筛选。搜索范围仅为最近 500 篇缓存文章。' : '添加订阅时会获取文章；已有来源可在订阅页手动刷新。'}</p>{query || selectedFeed ? <Button variant="outline" onClick={() => { setQuery(''); setFeedId('') }}>清除筛选</Button> : <Button onClick={() => navigate('feeds')}>前往订阅源</Button>}</div>}
  </>
}
