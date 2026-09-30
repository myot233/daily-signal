import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowUpRight, Download, FileCode2 } from 'lucide-react';
import { Button } from '@daily-signal/ui/button';
import { download, formatDate, safeUrl } from '@daily-signal/client';
import type { Digest } from '@daily-signal/domain';
import { protocolLabels } from '@daily-signal/domain/providers/catalog';
import { Source, Sources, SourcesContent, SourcesTrigger } from './ai-elements/sources';
import { CuratedReport } from './CuratedReport';

export function RichMarkdown({ content }: { content: string }) {
  return (
    <div className="report-markdown">
      <Markdown
        skipHtml
        remarkPlugins={[remarkGfm]}
        urlTransform={(url, key) => (key === 'src' ? undefined : safeUrl(url))}
        components={{
          a: ({ href, children }) =>
            safeUrl(href) ? (
              <a href={safeUrl(href)} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            ) : (
              <span>{children}</span>
            ),
          img: ({ alt }) =>
            alt ? <span className="image-omitted">[图片：{alt}，已省略]</span> : null,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}

const exportStyles = `body{margin:0;background:#fff;color:#242424;font-family:system-ui,-apple-system,"PingFang SC",sans-serif;line-height:1.8}main{max-width:760px;margin:48px auto;padding:32px}header{border-bottom:1px solid #e8e8e8;padding-bottom:24px;margin-bottom:32px}h1,h2,h3{font-weight:600;line-height:1.5}h1{font-size:28px}h2{font-size:22px;margin-top:32px}p,li{overflow-wrap:anywhere}a{color:inherit;text-underline-offset:3px}pre{overflow:auto;background:#f7f7f7;padding:18px}code{background:#f7f7f7;font-size:.88em}blockquote{border-left:2px solid #d4d4d4;margin:24px 0;padding:0 20px;color:#686868}table{display:block;overflow:auto;border-collapse:collapse;width:100%}td,th{border:1px solid #e8e8e8;padding:10px;text-align:left}img{display:none}footer{border-top:1px solid #e8e8e8;padding-top:20px;margin-top:40px;color:#686868;font-size:13px}@media(max-width:600px){main{margin:0;padding:24px}h1{font-size:24px}}`;
const exportLayoutStyles = `*{box-sizing:border-box}h1,h2,h3,summary,li{overflow-wrap:anywhere}pre{max-width:100%;overflow-wrap:normal}details{margin-bottom:20px}summary{cursor:pointer}a{overflow-wrap:anywhere}`;

export function Report({ digest }: { digest: Digest }) {
  function exportHtml() {
    // React escapes titles, source links and Markdown text in the entire document.
    const html = renderToStaticMarkup(
      <html lang="zh-CN">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>{digest.title}</title>
          <style>{exportStyles + exportLayoutStyles}</style>
        </head>
        <body>
          <main>
            <header>
              <h1>{digest.title}</h1>
              <p>
                {formatDate(digest.date)} · {digest.articleCount} 篇参考文章 · {digest.model}
                {digest.providerName && digest.providerProtocol
                  ? ` · ${digest.providerName} · ${protocolLabels[digest.providerProtocol]}`
                  : ''}
              </p>
            </header>
            <RichMarkdown content={digest.markdown} />
            <footer>
              <details>
                <summary>查看归档来源快照（{digest.sources.length}）</summary>
                <ol>
                  {digest.sources.map((source) => (
                    <li key={source.id}>
                      {safeUrl(source.url) ? (
                        <a href={safeUrl(source.url)} target="_blank" rel="noopener noreferrer">
                          {source.title}
                        </a>
                      ) : (
                        source.title
                      )}{' '}
                      · {source.feedTitle}
                    </li>
                  ))}
                </ol>
              </details>
              <p>生成于 {formatDate(digest.createdAt, true)}。AI 辅助整理，请以原文为准。</p>
            </footer>
          </main>
        </body>
      </html>,
    );
    download(
      `<!doctype html>${html}`,
      `daily-signal-${digest.date}.html`,
      'text/html;charset=utf-8',
    );
  }
  if (digest.curation)
    return <CuratedReport digest={digest} curation={digest.curation} exportHtml={exportHtml} />;
  return (
    <article className="report-document">
      <header className="mb-6 border-b pb-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <time className="text-xs text-muted-foreground" dateTime={digest.date}>
            {formatDate(digest.date)}
          </time>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                download(
                  digest.markdown,
                  `daily-signal-${digest.date}.md`,
                  'text/markdown;charset=utf-8',
                )
              }
            >
              <Download />
              Markdown
            </Button>
            <Button variant="ghost" size="sm" onClick={exportHtml}>
              <FileCode2 />
              导出 HTML
            </Button>
          </div>
        </div>
        <h2 className="text-[24px] font-medium leading-relaxed wrap-anywhere max-[640px]:text-xl">
          {digest.title}
        </h2>
        <p className="mt-2 text-xs text-muted-foreground">{digest.articleCount} 篇参考文章</p>
      </header>
      <RichMarkdown content={digest.markdown} />
      <Sources className="mt-8 mb-0 border-t border-t-border pt-3 text-[11px] text-muted-foreground">
        <SourcesTrigger
          count={digest.sources.length}
          className="w-full font-medium hover:text-primary"
        />
        <SourcesContent className="mt-1 w-full gap-0">
          <ol className="list-decimal pl-5">
            {digest.sources.map((source) => {
              const url = safeUrl(source.url);
              return (
                <li className="my-1 wrap-anywhere marker:text-muted-foreground" key={source.id}>
                  {url ? (
                    <Source
                      className="inline-flex min-h-11 max-w-full items-center gap-1.5 text-muted-foreground hover:text-primary hover:underline hover:underline-offset-3"
                      href={url}
                    >
                      <span className="min-w-0">{source.title}</span>
                      <ArrowUpRight aria-hidden="true" className="size-3.25 shrink-0" />
                    </Source>
                  ) : (
                    <span className="flex min-h-11 items-center">{source.title}</span>
                  )}
                  <span className="block text-[10px] text-muted-foreground">
                    {source.feedTitle}
                  </span>
                </li>
              );
            })}
          </ol>
        </SourcesContent>
      </Sources>
      <details className="mt-4 text-xs text-muted-foreground">
        <summary>生成记录</summary>
        <p className="mt-2 wrap-anywhere">
          {digest.model}
          {digest.providerName &&
            digest.providerProtocol &&
            ` · ${digest.providerName} · ${protocolLabels[digest.providerProtocol]}`}
          {' · '}
          {formatDate(digest.createdAt, true)}
        </p>
      </details>
      <p className="mt-5 text-xs text-muted-foreground">
        由 AI 辅助整理，可能存在遗漏或误读。重要信息请点击来源核实。
      </p>
    </article>
  );
}
