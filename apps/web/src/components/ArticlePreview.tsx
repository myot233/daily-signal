import { useLayoutEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, X } from 'lucide-react';
import type { Article } from '@daily-signal/domain';
import { formatDate, safeUrl } from '@daily-signal/client';
import { ArticleTranslation } from './ArticleTranslation';
import type { TranslateArticle, TranslationModel } from './ArticleTranslation';
import { Badge } from '@daily-signal/ui/badge';
import { Button } from '@daily-signal/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@daily-signal/ui/dialog';

type ArticlePreviewProps = {
  inline?: boolean;
  articles: readonly Article[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
  onRestoreFocus: () => void;
  translationModel: TranslationModel | null;
  translate: TranslateArticle;
  onConfigure: () => void;
};

export function ArticlePreview({
  inline = false,
  articles,
  index,
  open,
  onOpenChange,
  onIndexChange,
  onRestoreFocus,
  translationModel,
  translate,
  onConfigure,
}: ArticlePreviewProps) {
  const article = articles[index];
  const title = useRef<HTMLHeadingElement | null>(null);
  const body = useRef<HTMLDivElement | null>(null);
  const url = article ? safeUrl(article.url) : undefined;

  useLayoutEffect(() => {
    if (!open) return;
    if (!inline) title.current?.focus({ preventScroll: true });
    if (body.current) body.current.scrollTop = 0;
  }, [article?.id, open, inline]);

  if (!article) return null;

  const Title = inline ? 'h2' : DialogTitle;
  const Description = inline ? 'p' : DialogDescription;
  const content = (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b px-5 py-3 min-[1024px]:px-8">
        <span className="text-sm font-medium">文章预览</span>
        <span className="ml-auto text-xs text-muted-foreground" role="status" aria-label="阅读位置">
          {index + 1} / {articles.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="关闭文章预览"
          onClick={() => onOpenChange(false)}
        >
          <X />
        </Button>
      </div>
      <div
        ref={body}
        tabIndex={0}
        role="region"
        aria-label="文章内容"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-7 min-[1024px]:px-8"
      >
        <Title
          ref={title}
          tabIndex={-1}
          className="rounded-sm font-serif text-[26px] font-medium leading-normal wrap-anywhere"
        >
          {article.title}
        </Title>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground [&_[data-slot=badge]]:whitespace-normal [&_[data-slot=badge]]:wrap-anywhere">
          <Badge variant="secondary">{article.feedTitle}</Badge>
          <time dateTime={article.publishedAt}>{formatDate(article.publishedAt, true)}</time>
          {article.dateEstimated && <Badge variant="outline">估计日期</Badge>}
        </div>
        {article.dateEstimated && (
          <p className="mt-2 text-xs text-muted-foreground">
            来源未提供有效发布时间，使用首次发现时间，不代表当日发布。
          </p>
        )}
        {article.content.trim() ? (
          open && (
            <ArticleTranslation
              key={`${article.id}:${translationModel?.id}:${translationModel?.revision}`}
              articleId={article.id}
              content={article.content}
              model={translationModel}
              translate={translate}
              onConfigure={onConfigure}
            />
          )
        ) : (
          <p className="mt-7 rounded-md border bg-paper p-5 text-base leading-[1.8] text-muted-foreground">
            该来源未提供正文或摘要。
          </p>
        )}
        <Description className="mt-8 border-t pt-4 text-xs">
          预览基于订阅提供的缓存内容，可能仅含摘要或部分正文。
        </Description>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-paper px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] min-[1024px]:px-8">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={index === 0}
            onClick={() => onIndexChange(index - 1)}
          >
            <ArrowLeft />
            上一篇
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={index === articles.length - 1}
            onClick={() => onIndexChange(index + 1)}
          >
            下一篇
            <ArrowRight />
          </Button>
        </div>
        {url ? (
          <Button asChild size="sm" variant={article.content.trim() ? 'ghost' : 'default'}>
            <a href={url} target="_blank" rel="noopener noreferrer">
              打开原文
              <ArrowUpRight />
            </a>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">原文链接不可用</span>
        )}
      </div>
    </>
  );
  if (inline)
    return open ? (
      <section className="reader-detail" aria-label="文章预览">
        {content}
      </section>
    ) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        variant="drawer"
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          title.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
