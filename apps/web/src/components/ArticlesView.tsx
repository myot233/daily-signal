import { ui } from '@daily-signal/ui/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Search, X } from 'lucide-react';
import { formatDate, safeUrl, rpc } from '@daily-signal/client';
import type { View, ViewProps } from '@daily-signal/client';
import { Button } from '@daily-signal/ui/button';
import { Input } from '@daily-signal/ui/input';
import { Label } from '@daily-signal/ui/label';
import type { TranslateArticle } from './ArticleTranslation';
import { ArticlePreview } from './ArticlePreview';
import type { Article } from '@daily-signal/domain';

const translateArticle: TranslateArticle = (input, signal) => rpc.ai.translate(input, { signal });
const pageSize = 50;
const summaryLength = 280;

export function ArticlesView({
  state,
  busy,
  navigate,
  translate = translateArticle,
  desktopLayout = false,
  sourceFilter,
  onAddFeed,
}: ViewProps & {
  navigate: (view: View) => void;
  translate?: TranslateArticle;
  desktopLayout?: boolean;
  sourceFilter?: { id: string; onChange: (id: string) => void };
  onAddFeed?: () => void;
}) {
  const defaultProvider = state.providers.find((provider) =>
    provider.models.some((model) => model.id === state.defaultProviderModelId),
  );
  const defaultModel = defaultProvider?.models.find(
    (model) => model.id === state.defaultProviderModelId,
  );
  const translationModel =
    defaultProvider?.enabled && defaultProvider.hasCredential && defaultModel?.enabled
      ? {
          id: defaultModel.id,
          revision: defaultProvider.revision,
          label: `${defaultProvider.name} / ${defaultModel.modelId}`,
        }
      : null;
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 951px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 951px)');
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const inline = desktopLayout && wide;
  const [query, setQuery] = useState('');
  const [localFeedId, setLocalFeedId] = useState('');
  const feedId = sourceFilter?.id ?? localFeedId;
  const setFeedId = sourceFilter?.onChange ?? setLocalFeedId;
  const [preview, setPreview] = useState<{
    articles: Article[];
    index: number;
    feedId: string;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const articleList = useRef<HTMLDivElement | null>(null);

  const selectedFeed = state.feeds.some((feed) => feed.id === feedId) ? feedId : '';
  const feed = state.feeds.find((item) => item.id === selectedFeed);
  const Heading = sourceFilter ? 'h2' : 'h1';
  const ArticleHeading = sourceFilter ? 'h3' : 'h2';
  if (preview && preview.feedId !== selectedFeed) {
    setPreview(null);
    setPreviewOpen(false);
  }

  const articles = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('zh-CN');
    return state.articles.filter(
      (article) =>
        (!selectedFeed || article.feedId === selectedFeed) &&
        (!search ||
          `${article.title}\n${article.content}`.toLocaleLowerCase('zh-CN').includes(search)),
    );
  }, [state.articles, selectedFeed, query]);

  const [pagination, setPagination] = useState({ feedId: selectedFeed, query, index: 0 });
  const pageCount = Math.ceil(articles.length / pageSize);
  const page =
    pagination.feedId === selectedFeed && pagination.query === query
      ? Math.min(pagination.index, Math.max(0, pageCount - 1))
      : 0;
  if (
    pagination.feedId !== selectedFeed ||
    pagination.query !== query ||
    pagination.index !== page
  ) {
    setPagination({ feedId: selectedFeed, query, index: page });
  }
  const pageStart = page * pageSize;
  const visibleArticles = articles.slice(pageStart, pageStart + pageSize);

  function changePage(index: number) {
    setPagination({ feedId: selectedFeed, query, index });
    articleList.current?.scrollTo({ top: 0 });
    heading.current?.scrollIntoView({ block: 'nearest' });
  }

  function openPreview(index: number, trigger: HTMLButtonElement) {
    previewTrigger.current = trigger;
    setPreview({
      articles: articles.map((article) => ({ ...article })),
      index,
      feedId: selectedFeed,
    });
    setPreviewOpen(true);
  }

  function restoreFocus() {
    const target = previewTrigger.current?.isConnected ? previewTrigger.current : heading.current;
    target?.focus({ preventScroll: true });
  }

  const reader =
    preview && previewOpen ? (
      <ArticlePreview
        inline={inline}
        articles={preview.articles}
        index={preview.index}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onIndexChange={(index) =>
          setPreview((current) => (current ? { ...current, index } : current))
        }
        onRestoreFocus={restoreFocus}
        translationModel={translationModel}
        translate={translate}
        onConfigure={() => {
          setPreviewOpen(false);
          navigate('settings');
        }}
      />
    ) : null;

  return (
    <div className={inline ? 'reader-workspace' : undefined}>
      <div className={ui.viewHeading}>
        <Heading ref={heading} tabIndex={-1}>
          {sourceFilter ? feed?.title || '全部文章' : '文章'}
        </Heading>
        <span className="text-xs text-muted-foreground">{articles.length} 篇</span>
      </div>
      {sourceFilter && feed && (
        <div className="subscription-feed-info">
          {feed.error && <p className="text-destructive">刷新失败：{feed.error}</p>}
          <details>
            <summary>订阅详情</summary>
            <a href={safeUrl(feed.url)} target="_blank" rel="noopener noreferrer">
              {feed.url} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            <p>
              {feed.lastFetchedAt
                ? `上次更新 ${formatDate(feed.lastFetchedAt, true)}`
                : '尚未刷新，等待获取文章'}
            </p>
          </details>
        </div>
      )}
      <div className="reader-filters">
        <div className="reader-search">
          <Label className="sr-only" htmlFor="article-search">
            搜索文章
          </Label>
          <Search aria-hidden="true" size={15} />
          <Input
            id="article-search"
            placeholder="搜索文章"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {!sourceFilter && (
          <>
            <Label className="sr-only" htmlFor="article-feed">
              按来源筛选
            </Label>
            <select
              id="article-feed"
              className="h-9 max-w-52 rounded-md border border-input bg-paper px-2 text-xs"
              value={selectedFeed}
              onChange={(event) => setFeedId(event.target.value)}
            >
              <option value="">全部来源</option>
              {state.feeds.map((feed) => (
                <option value={feed.id} key={feed.id}>
                  {feed.title}
                </option>
              ))}
            </select>
          </>
        )}
        {(query || selectedFeed) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery('');
              setFeedId('');
            }}
          >
            <X />
            清除筛选
          </Button>
        )}
      </div>
      <div className={inline ? 'reader-panes' : undefined}>
        <div className="article-list" aria-label="文章列表" ref={articleList}>
          {articles.length ? (
            visibleArticles.map((article, index) => {
              const selected = previewOpen && preview?.articles[preview.index]?.id === article.id;
              return (
                <article
                  key={article.id}
                  className={`article-row ${selected ? 'is-selected' : ''}`}
                >
                  <div className="article-row-meta">
                    <span className="truncate">{article.feedTitle}</span>
                    <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
                    {article.dateEstimated && (
                      <span title="来源未提供发布时间，使用首次发现时间。">估计日期</span>
                    )}
                  </div>
                  <ArticleHeading>
                    <button
                      type="button"
                      aria-haspopup={inline ? undefined : 'dialog'}
                      aria-pressed={inline ? selected : undefined}
                      onClick={(event) => openPreview(pageStart + index, event.currentTarget)}
                    >
                      {article.title}
                    </button>
                  </ArticleHeading>
                  <p className="line-clamp-2 text-muted-foreground wrap-anywhere">
                    {article.content.trim().slice(0, summaryLength) || '暂无摘要'}
                  </p>
                </article>
              );
            })
          ) : (
            <div className={ui.emptyState}>
              <ArticleHeading>
                {query || selectedFeed ? '没有匹配的文章' : '暂无文章'}
              </ArticleHeading>
              <p>{query || selectedFeed ? '换个关键词或清除筛选。' : '添加订阅源后获取文章。'}</p>
              {query || selectedFeed ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setFeedId('');
                  }}
                >
                  清除筛选
                </Button>
              ) : onAddFeed ? (
                <Button disabled={!!busy} onClick={onAddFeed}>
                  添加订阅源
                </Button>
              ) : (
                <Button onClick={() => navigate('feeds')}>前往订阅源</Button>
              )}
            </div>
          )}
          {pageCount > 1 && (
            <nav
              aria-label="文章列表分页"
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-3"
            >
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => changePage(page - 1)}
              >
                上一页
              </Button>
              <span className="text-xs text-muted-foreground" role="status">
                第 {page + 1} / {pageCount} 页
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === pageCount - 1}
                onClick={() => changePage(page + 1)}
              >
                下一页
              </Button>
            </nav>
          )}
        </div>
        {inline &&
          (reader || (
            <div className={ui.emptyState}>
              <h2>选择一篇文章</h2>
            </div>
          ))}
      </div>
      {!inline && reader}
    </div>
  );
}
