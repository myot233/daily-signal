import { ui } from '@daily-signal/ui/styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, CheckCheck, Mail, MailOpen, Search, Star, X } from 'lucide-react';
import { formatDate, safeUrl, rpc } from '@daily-signal/client';
import type { View, ViewProps } from '@daily-signal/client';
import { Button } from '@daily-signal/ui/button';
import { Input } from '@daily-signal/ui/input';
import { Label } from '@daily-signal/ui/label';
import { filterArticles } from '@daily-signal/domain/reader';
import type { Article, ArticleFilter, ArticleUpdate, MarkArticlesRead } from '@daily-signal/domain';
import type { TranslateArticle } from './ArticleTranslation';
import { ArticlePreview } from './ArticlePreview';

const translateArticle: TranslateArticle = (input, signal) => rpc.ai.translate(input, { signal });
export type ArticleActions = {
  update: (input: ArticleUpdate) => Promise<Article>;
  markRead: (input: MarkArticlesRead) => Promise<{ updated: number }>;
};
const articleActions: ArticleActions = {
  update: (input) => rpc.articles.update(input),
  markRead: (input) => rpc.articles.markRead(input),
};
const pageSize = 50;
const summaryLength = 280;
const selectClass = 'h-9 min-w-0 rounded-md border border-input bg-paper px-2 text-xs';

export function ArticlesView({
  state,
  busy,
  perform,
  navigate,
  translate = translateArticle,
  actions = articleActions,
  desktopLayout = false,
  sourceFilter,
  onAddFeed,
}: ViewProps & {
  navigate: (view: View) => void;
  translate?: TranslateArticle;
  actions?: ArticleActions;
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
  const [status, setStatus] = useState<ArticleFilter['status']>('all');
  const [starredOnly, setStarredOnly] = useState(false);
  const [category, setCategory] = useState<string | undefined>();
  const [order, setOrder] = useState('newest');
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
  const attempted = useRef(new Set<string>());
  const savingRead = useRef(false);
  const [pendingReads, setPendingReads] = useState<string[]>([]);
  const searchInput = useRef<HTMLInputElement>(null);
  const selectedFeed = state.feeds.some((feed) => feed.id === feedId) ? feedId : '';
  const feed = state.feeds.find((item) => item.id === selectedFeed);
  const Heading = sourceFilter ? 'h2' : 'h1';
  const ArticleHeading = sourceFilter ? 'h3' : 'h2';
  const hasFilters = Boolean(
    query || selectedFeed || category !== undefined || status !== 'all' || starredOnly,
  );
  const categories = [...new Set(state.feeds.map((item) => item.category))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
  const filter = useMemo<ArticleFilter>(
    () => ({
      feedId: selectedFeed || undefined,
      category,
      query,
      status,
      starredOnly,
    }),
    [selectedFeed, category, query, status, starredOnly],
  );
  const articles = useMemo(() => {
    const matched = filterArticles(state.articles, state.feeds, filter);
    // Keep the supplied order for equal dates; it is deterministic on the server.
    return matched.sort((a, b) =>
      order === 'oldest'
        ? a.publishedAt.localeCompare(b.publishedAt)
        : b.publishedAt.localeCompare(a.publishedAt),
    );
  }, [state.articles, state.feeds, filter, order]);
  const filterKey = JSON.stringify([filter, order]);
  const [pagination, setPagination] = useState({ key: filterKey, page: 0 });
  const pageCount = Math.ceil(articles.length / pageSize);
  const page =
    pagination.key === filterKey ? Math.min(pagination.page, Math.max(0, pageCount - 1)) : 0;
  if (pagination.key !== filterKey || pagination.page !== page)
    setPagination({ key: filterKey, page });
  if (preview && preview.feedId !== selectedFeed) {
    setPreview(null);
    setPreviewOpen(false);
  }
  const pageStart = page * pageSize;
  const visibleArticles = articles.slice(pageStart, pageStart + pageSize);
  const unread = articles.filter((article) => !article.readAt).length;
  const liveArticles = useMemo(
    () => new Map(state.articles.map((article) => [article.id, article])),
    [state.articles],
  );
  const previewArticles =
    preview?.articles.map((snapshot) => {
      const live = liveArticles.get(snapshot.id);
      return live ? { ...snapshot, readAt: live.readAt, starred: live.starred } : snapshot;
    }) ?? [];
  const currentArticle = previewOpen && preview ? previewArticles[preview.index] : undefined;
  const eligibleReads = pendingReads.filter((id) => {
    const article = liveArticles.get(id);
    return article && !article.readAt;
  });
  if (eligibleReads.length !== pendingReads.length) setPendingReads(eligibleReads);
  useEffect(() => {
    if (
      !currentArticle ||
      currentArticle.readAt ||
      !liveArticles.has(currentArticle.id) ||
      attempted.current.has(currentArticle.id)
    )
      return;
    attempted.current.add(currentArticle.id);
    setPendingReads((pending) =>
      pending.includes(currentArticle.id) ? pending : [...pending, currentArticle.id],
    );
  }, [currentArticle, liveArticles]);
  useEffect(() => {
    const id = pendingReads[0];
    if (!id || busy || savingRead.current) return;
    // Visits are queued even while another action holds the application's save lock.
    savingRead.current = true;
    void perform('标记已读', async () => {
      await actions.update({ id, read: true });
    }).finally(() => {
      savingRead.current = false;
      setPendingReads((pending) => pending.filter((item) => item !== id));
    });
  }, [pendingReads, busy, liveArticles, perform, actions]);

  function clearFilters() {
    setQuery('');
    setFeedId('');
    setCategory(undefined);
    setStatus('all');
    setStarredOnly(false);
  }
  function openPreview(index: number, trigger: HTMLButtonElement) {
    attempted.current.clear();
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
  function updateArticle(article: Article, change: Omit<ArticleUpdate, 'id'>) {
    // Explicitly marking unread must not immediately trigger automatic marking again.
    attempted.current.add(article.id);
    if (change.read === false)
      setPendingReads((pending) => pending.filter((id) => id !== article.id));
    void perform('保存阅读状态', async () => {
      await actions.update({ id: article.id, ...change });
    });
  }
  function changePage(next: number) {
    setPagination({ key: filterKey, page: next });
    articleList.current?.scrollTo({ top: 0 });
    heading.current?.scrollIntoView({ block: 'nearest' });
  }
  const reader =
    preview && previewOpen ? (
      <ArticlePreview
        inline={inline}
        articles={previewArticles}
        index={preview.index}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onIndexChange={(index) =>
          setPreview((current) => (current ? { ...current, index } : current))
        }
        onRestoreFocus={restoreFocus}
        translationModel={translationModel}
        translate={translate}
        busy={!!busy || !currentArticle || !liveArticles.has(currentArticle.id)}
        onUpdate={(change) => {
          if (currentArticle) updateArticle(currentArticle, change);
        }}
        onConfigure={() => {
          setPreviewOpen(false);
          navigate('settings');
        }}
      />
    ) : null;
  return (
    <div
      className={inline ? 'reader-workspace' : undefined}
      onKeyDown={(event) => {
        if (
          event.key === '/' &&
          !previewOpen &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !(
            event.target instanceof HTMLElement &&
            event.target.closest('input, textarea, select, [contenteditable="true"]')
          )
        ) {
          event.preventDefault();
          searchInput.current?.focus();
        }
      }}
    >
      <div className={ui.viewHeading}>
        <Heading ref={heading} tabIndex={-1}>
          {sourceFilter ? feed?.title || '全部文章' : '文章'}
        </Heading>
        <span className="text-xs text-muted-foreground">{articles.length} 篇符合条件</span>
      </div>
      {sourceFilter && feed && (
        <div className="subscription-feed-info">
          <a href={safeUrl(feed.url)} target="_blank" rel="noopener noreferrer">
            {feed.url} <ArrowUpRight size={12} aria-hidden="true" />
          </a>
          <p>
            {feed.error
              ? `刷新失败：${feed.error}`
              : feed.lastFetchedAt
                ? `上次更新 ${formatDate(feed.lastFetchedAt, true)}`
                : '尚未刷新，等待获取文章'}
          </p>
        </div>
      )}
      <div className="reader-filters">
        <div className="reader-search">
          <Label className="sr-only" htmlFor="article-search">
            搜索文章
          </Label>
          <Search aria-hidden="true" size={15} />
          <Input
            ref={searchInput}
            id="article-search"
            placeholder="搜索文章"
            maxLength={500}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-keyshortcuts="/"
          />
        </div>
        {!sourceFilter && (
          <>
            <Label className="sr-only" htmlFor="article-feed">
              按来源筛选
            </Label>
            <select
              id="article-feed"
              className={selectClass}
              value={selectedFeed}
              onChange={(event) => setFeedId(event.target.value)}
            >
              <option value="">全部来源</option>
              {state.feeds.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </>
        )}
        <Label className="sr-only" htmlFor="article-category">
          按分组筛选
        </Label>
        <select
          id="article-category"
          className={selectClass}
          value={category === undefined ? 'all' : `category:${category}`}
          onChange={(event) => {
            setCategory(event.target.value === 'all' ? undefined : event.target.value.slice(9));
            setFeedId('');
          }}
        >
          <option value="all">全部分组</option>
          {categories.map((item) => (
            <option value={`category:${item}`} key={item}>
              {item || '未分类'}
            </option>
          ))}
        </select>
        <Label className="sr-only" htmlFor="article-status">
          阅读状态
        </Label>
        <select
          id="article-status"
          className={selectClass}
          value={status}
          onChange={(event) =>
            setStatus(
              event.target.value === 'read'
                ? 'read'
                : event.target.value === 'unread'
                  ? 'unread'
                  : 'all',
            )
          }
        >
          <option value="all">全部状态</option>
          <option value="unread">未读</option>
          <option value="read">已读</option>
        </select>
        <Button
          variant={starredOnly ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={starredOnly}
          onClick={() => setStarredOnly(!starredOnly)}
        >
          <Star />
          只看收藏
        </Button>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X />
            清除筛选
          </Button>
        )}
      </div>
      <div className="reader-toolbar">
        <Label className="sr-only" htmlFor="article-order">
          文章排序
        </Label>
        <select
          id="article-order"
          className={selectClass}
          value={order}
          onChange={(event) => setOrder(event.target.value)}
        >
          <option value="newest">最新优先</option>
          <option value="oldest">最早优先</option>
        </select>
        <Button
          variant="ghost"
          size="sm"
          disabled={!!busy || !unread}
          onClick={() =>
            void perform(
              '批量标记已读',
              async () => {
                await actions.markRead({ filter, read: true });
              },
              '当前筛选中的文章已标为已读。',
            )
          }
        >
          <CheckCheck />
          全部标为已读（{unread}）
        </Button>
      </div>
      <div className={inline ? 'reader-panes' : undefined}>
        <div className="article-list" aria-label="文章列表" ref={articleList}>
          {articles.length ? (
            visibleArticles.map((article, index) => {
              const url = safeUrl(article.url);
              const selected = previewOpen && preview?.articles[preview.index]?.id === article.id;
              return (
                <article
                  key={article.id}
                  className={`article-row ${selected ? 'is-selected' : ''} ${article.readAt ? 'is-read' : ''}`}
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
                  <div className="article-row-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!busy}
                      aria-label={`${article.readAt ? '标为未读' : '标为已读'}：${article.title}`}
                      onClick={() => updateArticle(article, { read: !article.readAt })}
                    >
                      {article.readAt ? <MailOpen /> : <Mail />}
                      {article.readAt ? '已读' : '未读'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={!!busy}
                      aria-label={`${article.starred ? '取消收藏' : '收藏'}：${article.title}`}
                      aria-pressed={!!article.starred}
                      onClick={() => updateArticle(article, { starred: !article.starred })}
                    >
                      <Star className={article.starred ? 'fill-current text-primary' : ''} />
                    </Button>
                    {!inline && url && (
                      <a
                        className="ml-auto inline-flex items-center gap-1 text-xs text-primary"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          if (!article.readAt) updateArticle(article, { read: true });
                        }}
                      >
                        打开原文
                        <ArrowUpRight size={12} />
                      </a>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className={ui.emptyState}>
              <BookOpen size={26} strokeWidth={1.5} />
              <ArticleHeading>{hasFilters ? '没有匹配的文章' : '暂无文章'}</ArticleHeading>
              <p>{hasFilters ? '换个关键词或清除筛选。' : '添加订阅源后获取文章。'}</p>
              {hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>
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
        </div>
        {inline &&
          (reader || (
            <div className={ui.emptyState}>
              <BookOpen size={28} strokeWidth={1.5} />
              <h2>选择一篇文章</h2>
              <p>在左侧列表中选择文章以阅读。</p>
            </div>
          ))}
      </div>
      {pageCount > 1 && (
        <nav className="reader-pagination" aria-label="文章列表分页">
          <Button variant="outline" size="sm" disabled={!page} onClick={() => changePage(page - 1)}>
            上一页
          </Button>
          <span role="status">
            第 {page + 1} / {pageCount} 页 · {pageStart + 1}–
            {Math.min(pageStart + pageSize, articles.length)} 篇
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount - 1}
            onClick={() => changePage(page + 1)}
          >
            下一页
          </Button>
        </nav>
      )}
      {!inline && reader}
    </div>
  );
}
