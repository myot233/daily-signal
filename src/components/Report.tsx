import { ui } from '../lib/ui-styles';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArrowUpRight, Download, FileCode2, Sparkles } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { download, formatDate, safeUrl } from '../lib/client';
import type { Digest } from '../../shared/types';
import { protocolLabels } from '../../shared/providers/catalog';
import { Source, Sources, SourcesContent, SourcesTrigger } from './ai-elements/sources';

export function RichMarkdown({ content }: { content: string }) {
  return (
    <div className="text-[#484237] text-[14px] min-w-0 wrap-anywhere [&_>_:first-child]:mt-0 [&_h1]:font-serif [&_h1]:font-semibold [&_h1]:text-[#302b22] [&_h2]:font-serif [&_h2]:font-semibold [&_h2]:text-[#302b22] [&_h3]:font-serif [&_h3]:font-semibold [&_h3]:text-[#302b22] [&_h4]:font-serif [&_h4]:font-semibold [&_h4]:text-[#302b22] [&_h1]:text-[29px] [&_h1]:mt-7.5 [&_h1]:mx-0 [&_h1]:mb-4.5 [&_h2]:text-[24px] [&_h2]:mt-8.75 [&_h2]:mx-0 [&_h2]:mb-4.5 [&_h2]:pb-2.5 [&_h2]:border-b [&_h2]:border-b-border [&_h3]:text-[19px] [&_h3]:mt-6.25 [&_h3]:mx-0 [&_h3]:mb-3 [&_h4]:text-[16px] [&_h4]:mt-5.25 [&_h4]:mx-0 [&_h4]:mb-2.5 [&_p]:my-4 [&_p]:mx-0 [&_ul]:my-3.75 [&_ul]:mx-0 [&_ul]:pl-6.25 [&_ol]:my-3.75 [&_ol]:mx-0 [&_ol]:pl-6.25 [&_ul]:list-disc [&_ol]:list-decimal [&_li]:my-1.75 [&_li]:mx-0 [&_li]:pl-0.75 [&_li::marker]:text-[#ac744c] [&_li_>_p]:my-1.5 [&_li_>_p]:mx-0 [&_a]:text-primary [&_a]:underline [&_a]:decoration-[#d2ae92] [&_a]:underline-offset-4 [&_a:hover]:decoration-currentColor [&_blockquote]:bg-[#f4f0e6] [&_blockquote]:border-l-3 [&_blockquote]:border-l-[#ad7651] [&_blockquote]:py-0.75 [&_blockquote]:px-5.5 [&_blockquote]:my-5.75 [&_blockquote]:mx-0 [&_blockquote]:text-[#827358] [&_code]:bg-[#eeece3] [&_code]:text-[#855d42] [&_code]:text-[.88em] [&_code]:font-mono [&_code]:font-normal [&_code]:leading-normal [&_code]:py-0.5 [&_code]:px-1.25 [&_code]:rounded-[3px] [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:bg-[#f0eee5] [&_pre]:border [&_pre]:border-[#e4dfd1] [&_pre]:rounded-[6px] [&_pre]:py-4.25 [&_pre]:px-5 [&_pre]:my-5 [&_pre]:mx-0 [&_pre]:leading-[1.8] [&_pre]:wrap-normal [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:border-0 [&_pre_code]:text-[#514b3b] [&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-[12px] [&_table]:my-5.75 [&_table]:mx-0 [&_th]:min-w-28.75 [&_th]:py-2.75 [&_th]:px-3.5 [&_th]:border [&_th]:border-[#dcd6c6] [&_th]:text-left [&_th]:align-top [&_td]:min-w-28.75 [&_td]:py-2.75 [&_td]:px-3.5 [&_td]:border [&_td]:border-[#dcd6c6] [&_td]:text-left [&_td]:align-top [&_th]:bg-[#eeeadf] [&_th]:text-[#6b5b40] [&_th]:font-medium [&_hr]:border-0 [&_hr]:border-t [&_hr]:border-t-[#dad3c0] [&_hr]:my-7.5 [&_hr]:mx-0 [&_.image-omitted]:text-[11px] [&_.image-omitted]:text-[#9a8e79] [&_.image-omitted]:italic max-[640px]:text-[13px] max-[640px]:[&_h1]:text-[25px] max-[640px]:[&_h2]:text-[22px] max-[640px]:[&_h3]:text-[18px] max-[640px]:[&_blockquote]:px-4 max-[640px]:[&_pre]:p-3.5">
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

const exportStyles = `body{margin:0;background:#f6f4ee;color:#282620;font-family:system-ui,-apple-system,sans-serif;line-height:1.85}main{max-width:800px;margin:48px auto;padding:40px;background:#fffef9;border:1px solid #dedbd1}header{border-bottom:2px solid #282620;padding-bottom:24px;margin-bottom:32px}.brand{letter-spacing:.16em;font-size:12px;color:#a3482a}h1,h2,h3{font-family:Georgia,"Songti SC",serif;line-height:1.5}h1{font-size:32px}h2{font-size:25px;border-bottom:1px solid #dedbd1;padding-bottom:10px;margin-top:32px}p,li{overflow-wrap:anywhere}a{color:#a3482a}pre{overflow:auto;background:#efede5;padding:18px}code{background:#efede5;font-size:.88em}blockquote{border-left:3px solid #b95632;margin:24px 0;padding:8px 22px;color:#666158}table{display:block;overflow:auto;border-collapse:collapse;width:100%}td,th{border:1px solid #d7d3c8;padding:10px;text-align:left}img{display:none}footer{border-top:1px solid #dedbd1;padding-top:20px;margin-top:40px;color:#716c60;font-size:13px}@media(max-width:600px){main{margin:0;padding:24px;border:0}h1{font-size:26px}}`;
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
              <div className="brand">DAILY SIGNAL · 技术日报</div>
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
  return (
    <article className="max-w-210 mt-6.25 mx-auto mb-0 bg-paper border border-[#dad6c8] py-8.25 px-11.75 shadow-[0_5px_20px_#35281105] min-w-0 max-[1150px]:px-7.5 max-[640px]:py-5.5 max-[640px]:px-5 max-[640px]:mt-5">
      <div className="flex flex-wrap gap-3 justify-between items-center border-b border-b-border pb-5 mb-6.5 [&_button]:text-[10px] max-[640px]:gap-2.25 max-[640px]:mb-5.5 max-[640px]:[&_.button-row]:gap-0 max-[640px]:[&_button]:text-[9px] max-[640px]:[&_button]:px-1.75">
        <Badge variant="outline">
          <Sparkles aria-hidden="true" size={12} />
          AI 生成 · 已归档
        </Badge>
        <div className="button-row flex items-center flex-wrap gap-1.75">
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
      <div className={ui.eyebrow}>DAILY SIGNAL / {digest.date.replaceAll('-', '.')}</div>
      <h2 className="font-serif text-[32px] leading-[1.5] font-semibold wrap-anywhere max-[640px]:text-[27px]">
        {digest.title}
      </h2>
      <p className="flex flex-wrap gap-2 text-muted-foreground text-[10px] mt-3.5 mx-0 mb-7.5 pb-5.75 border-b-2 border-b-[#514b3d] wrap-anywhere max-[640px]:text-[9px] max-[640px]:mb-6">
        {digest.articleCount} 篇参考文章 <span>·</span> {digest.model}
        {digest.providerName && digest.providerProtocol && (
          <>
            <span>·</span>
            {digest.providerName}
            <span>·</span>
            {protocolLabels[digest.providerProtocol]}
          </>
        )}{' '}
        <span>·</span> {formatDate(digest.createdAt, true)}
      </p>
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
                <li className="my-1 wrap-anywhere marker:text-[#b8aa90]" key={source.id}>
                  {url ? (
                    <Source
                      className="inline-flex min-h-11 max-w-full items-center gap-1.5 text-[#87633f] hover:text-primary hover:underline hover:underline-offset-3"
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
      <p className="mt-5 text-[10px] text-muted-foreground">
        由 AI 辅助整理，可能存在遗漏或误读。重要信息请点击来源核实。
      </p>
    </article>
  );
}
