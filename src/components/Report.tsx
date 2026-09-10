import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { renderToStaticMarkup } from 'react-dom/server'
import { ArrowUpRight, Download, FileCode2 } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { download, formatDate, safeUrl } from '../lib/client'
import type { Digest } from '../../shared/types'

export function RichMarkdown({ content }: { content: string }) {
  return <div className="prose"><Markdown skipHtml remarkPlugins={[remarkGfm]} urlTransform={(url, key) => key === 'src' ? undefined : safeUrl(url)} components={{
    a: ({ href, children }) => safeUrl(href) ? <a href={safeUrl(href)} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>,
    img: ({ alt }) => alt ? <span className="image-omitted">[图片：{alt}，已省略]</span> : null,
  }}>{content}</Markdown></div>
}

const exportStyles = `body{margin:0;background:#f6f4ee;color:#282620;font-family:system-ui,-apple-system,sans-serif;line-height:1.85}main{max-width:800px;margin:48px auto;padding:40px;background:#fffef9;border:1px solid #dedbd1}header{border-bottom:2px solid #282620;padding-bottom:24px;margin-bottom:32px}.brand{letter-spacing:.16em;font-size:12px;color:#a3482a}h1,h2,h3{font-family:Georgia,"Songti SC",serif;line-height:1.5}h1{font-size:32px}h2{font-size:25px;border-bottom:1px solid #dedbd1;padding-bottom:10px;margin-top:32px}p,li{overflow-wrap:anywhere}a{color:#a3482a}pre{overflow:auto;background:#efede5;padding:18px}code{background:#efede5;font-size:.88em}blockquote{border-left:3px solid #b95632;margin:24px 0;padding:8px 22px;color:#666158}table{display:block;overflow:auto;border-collapse:collapse;width:100%}td,th{border:1px solid #d7d3c8;padding:10px;text-align:left}img{display:none}footer{border-top:1px solid #dedbd1;padding-top:20px;margin-top:40px;color:#716c60;font-size:13px}@media(max-width:600px){main{margin:0;padding:24px;border:0}h1{font-size:26px}}`
const exportLayoutStyles = `*{box-sizing:border-box}h1,h2,h3,summary,li{overflow-wrap:anywhere}pre{max-width:100%;overflow-wrap:normal}details{margin-bottom:20px}summary{cursor:pointer}a{overflow-wrap:anywhere}`

export function Report({ digest }: { digest: Digest }) {
  function exportHtml() {
    // React escapes titles, source links and Markdown text in the entire document.
    const html = renderToStaticMarkup(
      <html lang="zh-CN"><head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{digest.title}</title><style>{exportStyles + exportLayoutStyles}</style></head>
        <body><main><header><div className="brand">DAILY SIGNAL · 技术日报</div><h1>{digest.title}</h1><p>{formatDate(digest.date)} · {digest.articleCount} 篇参考文章 · {digest.model}</p></header>
          <RichMarkdown content={digest.markdown} />
          <footer><details><summary>查看归档来源快照（{digest.sources.length}）</summary><ol>{digest.sources.map(source => <li key={source.id}>{safeUrl(source.url) ? <a href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a> : source.title} · {source.feedTitle}</li>)}</ol></details><p>生成于 {formatDate(digest.createdAt, true)}。AI 辅助整理，请以原文为准。</p></footer>
        </main></body>
      </html>,
    )
    download(`<!doctype html>${html}`, `daily-signal-${digest.date}.html`, 'text/html;charset=utf-8')
  }
  return <article className="report-paper">
    <div className="report-topline"><Badge variant="outline">已归档</Badge><div className="button-row"><Button variant="ghost" size="sm" onClick={() => download(digest.markdown, `daily-signal-${digest.date}.md`, 'text/markdown;charset=utf-8')}><Download />Markdown</Button><Button variant="ghost" size="sm" onClick={exportHtml}><FileCode2 />导出 HTML</Button></div></div>
    <div className="eyebrow">DAILY SIGNAL / {digest.date.replaceAll('-', '.')}</div><h2 className="report-title">{digest.title}</h2><p className="report-meta">{digest.articleCount} 篇参考文章 <span>·</span> {digest.model} <span>·</span> {formatDate(digest.createdAt, true)}</p>
    <RichMarkdown content={digest.markdown} />
    <details className="source-index"><summary>查看参考来源（{digest.sources.length}）</summary><ol>{digest.sources.map(source => <li key={source.id}>{safeUrl(source.url) ? <a href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.title}<ArrowUpRight size={13} /></a> : source.title}<span>{source.feedTitle}</span></li>)}</ol></details>
    <p className="report-disclaimer">由 AI 辅助整理，可能存在遗漏或误读。重要信息请点击来源核实。</p>
  </article>
}
