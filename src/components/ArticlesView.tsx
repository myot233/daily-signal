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
    <div className="view-heading"><div><div className="eyebrow">原始阅读 · 保留上下文</div><h1>灵感，在字里行间。</h1><p>先读原文，再形成自己的判断。这里是日报背后的真实信息。</p></div></div>
    <Card className="article-filters"><div className="field search-field"><Label htmlFor="article-search">搜索文章</Label><div className="input-icon"><Search size={16} /><Input id="article-search" placeholder="搜索标题或订阅正文…" value={query} onChange={event => setQuery(event.target.value)} /></div></div><div className="field"><Label htmlFor="article-feed">按来源筛选</Label><select id="article-feed" className="native-select" value={selectedFeed} onChange={event => setFeedId(event.target.value)}><option value="">全部来源</option>{state.feeds.map(feed => <option value={feed.id} key={feed.id}>{feed.title}</option>)}</select></div>{(query || selectedFeed) && <Button variant="ghost" onClick={() => { setQuery(''); setFeedId('') }}><X />清除筛选</Button>}</Card>
    <div className="section-toolbar"><span className="section-label">{articles.length} 篇符合条件</span><span className="quiet-note">仅展示最近 500 篇缓存 · 日报按整日完整查询</span></div>
    {articles.length ? <div className="article-list">{articles.map(article => <Card key={article.id} className="article-card"><div className="article-meta"><Badge variant="secondary">{article.feedTitle}</Badge><time dateTime={article.publishedAt}>{formatDate(article.publishedAt, true)}</time>{article.dateEstimated && <Badge variant="outline" title="来源未提供有效发布时间，使用首次发现时间，不代表当日发布。">估计日期</Badge>}</div><h2>{safeUrl(article.url) ? <a href={safeUrl(article.url)} target="_blank" rel="noopener noreferrer">{article.title}<ArrowUpRight size={17} /></a> : article.title}</h2><p className="article-excerpt">{article.content || '此来源未提供正文或摘要，请打开原文阅读。'}</p><div className="article-bottom"><span>订阅提供的正文 / 摘要，非另行抓取全文</span>{safeUrl(article.url) && <a className="text-link" href={safeUrl(article.url)} target="_blank" rel="noopener noreferrer">阅读原文 <ArrowUpRight size={13} /></a>}</div></Card>)}</div> : <div className="empty-list"><BookOpen size={32} strokeWidth={1.3} /><h3>{query || selectedFeed ? '这一页，暂时没有匹配的文章。' : '还没有文章，先带几个来源进来。'}</h3><p>{query || selectedFeed ? '换个关键词或清除筛选。搜索范围仅为最近 500 篇缓存文章。' : '添加订阅时会获取文章；已有来源可在订阅页手动刷新。'}</p>{query || selectedFeed ? <Button variant="outline" onClick={() => { setQuery(''); setFeedId('') }}>清除筛选</Button> : <Button onClick={() => navigate('feeds')}>前往订阅源</Button>}</div>}
  </>
}
