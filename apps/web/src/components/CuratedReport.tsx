import { Download, FileCode2, ArrowUpRight } from 'lucide-react';
import type { Digest } from '@daily-signal/domain';
import type { DigestCuration } from '@daily-signal/domain/curation';
import { download, formatDate, safeUrl } from '@daily-signal/client';
import { Button } from '@daily-signal/ui/button';
import { Badge } from '@daily-signal/ui/badge';

export function CuratedReport({
  digest,
  curation,
  exportHtml,
}: {
  digest: Digest;
  curation: DigestCuration;
  exportHtml: () => void;
}) {
  const stats = curation.stats;
  return (
    <article className="min-w-0 rounded-lg border bg-paper" aria-label="精选日报">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-base font-semibold">{digest.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.inputCount} 篇文章 · {curation.cards.length} 条精选 · {stats.cachedCount} 篇复用
          </p>
        </div>
        <div className="flex gap-1">
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
            HTML
          </Button>
        </div>
      </header>
      {curation.cards.length ? (
        <div className="divide-y">
          {curation.cards.map((card) => {
            const sources = card.sourceIds
              .map((id) => digest.sources.find((source) => source.id === id))
              .filter((source) => source !== undefined);
            const hasWebText = curation.documents.some(
              (doc) => card.sourceIds.includes(doc.sourceId) && doc.kind === 'web',
            );
            return (
              <section key={card.id} className="min-w-0 px-4 py-5 sm:px-5">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {card.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {sources.length} 个来源 · {hasWebText ? '已提取正文' : '订阅摘要'}
                  </span>
                </div>
                <h3 className="text-base font-semibold leading-relaxed wrap-anywhere">
                  {card.title}
                </h3>
                <p className="mt-2 text-sm leading-7 wrap-anywhere">{card.summary}</p>
                {card.impact && (
                  <p className="mt-2 text-sm leading-7 text-muted-foreground wrap-anywhere">
                    <span className="mr-2 text-xs font-medium text-primary">分析</span>
                    {card.impact}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  {sources.map((source) =>
                    safeUrl(source.url) ? (
                      <a
                        key={source.id}
                        href={safeUrl(source.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                        title={source.title}
                      >
                        {source.feedTitle}
                        <ArrowUpRight aria-hidden="true" size={12} />
                      </a>
                    ) : (
                      <span key={source.id}>{source.feedTitle}</span>
                    ),
                  )}
                </div>
                <details className="mt-3 text-xs text-muted-foreground">
                  <summary className="w-fit cursor-pointer py-1">
                    原文依据（{card.evidence.length}）
                  </summary>
                  <div className="mt-2 grid gap-3">
                    {card.evidence.map((evidence, index) => {
                      const source = sources.find((item) => item.id === evidence.sourceId);
                      const document = curation.documents.find(
                        (item) => item.sourceId === evidence.sourceId,
                      );
                      return (
                        <figure key={index} className="border-l-2 pl-3">
                          <blockquote className="leading-6 wrap-anywhere">
                            {evidence.quote}
                          </blockquote>
                          <figcaption className="mt-1">
                            {source?.title} ·{' '}
                            {document?.kind === 'web' ? '网页正文节选' : '订阅内容'}
                            {source?.dateEstimated ? ' · 发布时间未知' : ''}
                          </figcaption>
                        </figure>
                      );
                    })}
                    <p>引文已与保存的资料逐字匹配；摘要与分析仍需结合原文判断。</p>
                  </div>
                </details>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="p-6 text-sm text-muted-foreground">
          本次没有符合兴趣标签和筛选门槛的内容。可以调整偏好后重新生成。
        </p>
      )}
      <footer className="border-t px-4 py-3 text-xs text-muted-foreground">
        <details>
          <summary className="cursor-pointer">生成记录</summary>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            <dt>去重后文章</dt>
            <dd>{stats.uniqueCount} 篇</dd>
            <dt>达到门槛</dt>
            <dd>{stats.eligibleCount} 篇</dd>
            <dt>参与事件归组</dt>
            <dd>
              {stats.candidateCount} 篇 / {stats.eventCount} 个事件
            </dd>
            <dt>提取网页正文</dt>
            <dd>{stats.fullTextCount} 篇</dd>
            <dt>模型调用</dt>
            <dd>{stats.modelCalls} 次</dd>
            <dt>模型报告的输入 / 输出 tokens</dt>
            <dd>
              {stats.inputTokens} / {stats.outputTokens}
            </dd>
            <dt>生成耗时</dt>
            <dd>{(stats.durationMs / 1000).toFixed(1)} 秒</dd>
            <dt>模型</dt>
            <dd className="wrap-anywhere">{digest.model}</dd>
          </dl>
          <p className="mt-3">
            {formatDate(digest.createdAt, true)} · {digest.providerName}
          </p>
        </details>
      </footer>
    </article>
  );
}
