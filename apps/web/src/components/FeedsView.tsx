import { ui } from '@daily-signal/ui/styles';
import { useEffect, useRef, useState } from 'react';
import { Download, LoaderCircle, Plus, RefreshCw, Pencil, Trash2, Upload, X } from 'lucide-react';
import { Button } from '@daily-signal/ui/button';
import { Input } from '@daily-signal/ui/input';
import { Label } from '@daily-signal/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@daily-signal/ui/dialog';
import { rpc, download, type View, type ViewProps } from '@daily-signal/client';
import {
  addFeedSchema,
  feedUpdateSchema,
  type FeedUpdate,
  importOpmlSchema,
  type Feed,
  type FeedRefreshStatus,
  type ImportResult,
} from '@daily-signal/domain';
import { CachedFeedIcon } from './FeedIcon';
import { FeedRefreshProgress } from './FeedRefreshProgress';
import { ArticlesView, type ArticleActions } from './ArticlesView';

export function FeedsView({
  state,
  busy,
  perform,
  notify,
  feedRefresh,
  refresh,
  refreshing = false,
  navigate,
  articleActions,
  saveFeed = (input: FeedUpdate) => rpc.feeds.update(input),
}: ViewProps & {
  feedRefresh?: FeedRefreshStatus | null;
  refresh: () => void;
  refreshing?: boolean;
  navigate: (view: View) => void;
  articleActions?: ArticleActions;
  saveFeed?: (input: FeedUpdate) => Promise<Feed>;
}) {
  const [feedId, setFeedId] = useState('');
  const selectedFeedId = state.feeds.some((feed) => feed.id === feedId) ? feedId : '';
  const articlePane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    articlePane.current?.scrollTo({ top: 0 });
  }, [selectedFeedId]);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState<Feed | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const groups = [...new Set(state.feeds.map((feed) => feed.category))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN'),
  );
  const [deleting, setDeleting] = useState<Feed | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addFeed() {
    const done = await perform(
      '添加订阅源',
      async () => {
        await rpc.feeds.add(addFeedSchema.parse({ url, category }));
      },
      '已添加并获取文章。',
    );
    if (done) {
      setAdding(false);
      setUrl('');
      setCategory('');
    }
  }
  async function importFile(file?: File) {
    if (!file) return;
    setImportResult(null);
    await perform('导入 OPML', async () => {
      if (file.size > 2 * 1024 * 1024) throw new Error('OPML 文件不能超过 2 MiB。');
      const result = await rpc.feeds.import(importOpmlSchema.parse({ opml: await file.text() }));
      setImportResult(result);
    });
  }
  return (
    <section className="subscriptions-workspace">
      <div className={ui.viewHeading}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1>订阅与文章</h1>
          <FeedRefreshProgress value={feedRefresh} />
        </div>
        <div className="subscription-actions">
          <input
            ref={fileInput}
            type="file"
            accept=".opml,.xml,text/xml,application/xml"
            className="sr-only"
            aria-label="导入 OPML 文件"
            disabled={!!busy || refreshing}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void importFile(file);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={!!busy || refreshing}
            onClick={() => fileInput.current?.click()}
          >
            <Upload />
            导入 OPML
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!!busy || !state.feeds.length}
            onClick={() =>
              void perform(
                '导出 OPML',
                async () => {
                  const { opml } = await rpc.feeds.export();
                  download(opml, 'daily-signal-feeds.opml', 'application/xml;charset=utf-8');
                },
                '订阅列表已导出。',
              )
            }
          >
            <Download />
            导出
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!!busy || refreshing || !state.feeds.length}
            onClick={refresh}
          >
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            刷新订阅
          </Button>
          <Button size="sm" disabled={!!busy} onClick={() => setAdding(true)}>
            <Plus />
            添加订阅源
          </Button>
        </div>
      </div>
      {importResult && (
        <div
          className={`app-notice subscription-import ${importResult.errors.length ? 'warning' : 'success'}`}
          role="status"
        >
          <div>
            <p>
              OPML 导入结果：新增 {importResult.imported} 个 · 跳过 {importResult.skipped} 个 · 失败{' '}
              {importResult.errors.length} 个{importResult.imported > 0 && '。文章正在后台抓取。'}
            </p>
            {importResult.errors.length > 0 && (
              <details>
                <summary>失败详情</summary>
                <ul>
                  {importResult.errors.map((item, index) => (
                    <li key={index}>
                      <strong>{item.url || '未知订阅源'}</strong>：{item.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="关闭导入结果"
            onClick={() => setImportResult(null)}
          >
            <X />
          </Button>
        </div>
      )}
      <div className="subscription-panes">
        <aside className="subscription-sidebar" aria-label="订阅源列表">
          <h2 className="sr-only">选择订阅源</h2>
          <div className="subscription-sources">
            <button
              type="button"
              className="subscription-source"
              aria-pressed={!selectedFeedId}
              onClick={() => setFeedId('')}
            >
              <span className="subscription-source-name">全部文章</span>
              <span className="subscription-count">
                {state.feeds.reduce(
                  (sum, feed) =>
                    sum +
                    (feed.unreadCount ??
                      state.articles.filter(
                        (article) => article.feedId === feed.id && !article.readAt,
                      ).length),
                  0,
                )}{' '}
                未读
              </span>
            </button>
            {groups.map((group) => (
              <div key={group}>
                {group && <h3 className="subscription-group">{group}</h3>}
                {state.feeds
                  .filter((feed) => feed.category === group)
                  .map((feed) => (
                    <div className="subscription-source-row" key={feed.id}>
                      <button
                        type="button"
                        className="subscription-source"
                        aria-label={feed.title}
                        aria-pressed={selectedFeedId === feed.id}
                        title={feed.title}
                        onClick={() => setFeedId(feed.id)}
                      >
                        <CachedFeedIcon feed={feed} />
                        <span className="subscription-source-label">
                          <span className="subscription-source-name">{feed.title}</span>
                          {feed.error && (
                            <span className="subscription-source-category">刷新失败</span>
                          )}
                        </span>
                        <span className="subscription-count" title={`${feed.articleCount} 篇文章`}>
                          {feed.unreadCount ??
                            state.articles.filter(
                              (article) => article.feedId === feed.id && !article.readAt,
                            ).length}{' '}
                          未读
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`编辑 ${feed.title}`}
                        disabled={!!busy}
                        onClick={() => {
                          setEditing(feed);
                          setEditTitle(feed.title);
                          setEditCategory(feed.category);
                        }}
                      >
                        <Pencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`删除 ${feed.title}`}
                        disabled={!!busy}
                        onClick={() => setDeleting(feed)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
              </div>
            ))}
          </div>
          {!state.feeds.length && (
            <p className="subscription-hint">添加 RSS / Atom 地址，或导入 OPML 开始阅读。</p>
          )}
        </aside>
        <div className="subscription-articles" ref={articlePane}>
          <ArticlesView
            state={state}
            busy={busy}
            perform={perform}
            notify={notify}
            navigate={navigate}
            actions={articleActions}
            sourceFilter={{ id: selectedFeedId, onChange: setFeedId }}
            onAddFeed={() => setAdding(true)}
          />
        </div>
      </div>
      <Dialog
        open={adding}
        onOpenChange={(open) => {
          if (!busy) setAdding(open);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>添加订阅源</DialogTitle>
            <DialogDescription>输入 RSS 或 Atom 地址，添加后获取文章。</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addFeed();
            }}
            className="flex flex-col gap-5.5"
          >
            <div className={ui.field}>
              <Label htmlFor="feed-url">订阅地址</Label>
              <Input
                id="feed-url"
                type="url"
                required
                maxLength={8192}
                placeholder="https://example.com/feed.xml"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={!!busy}
              />
            </div>
            <div className={ui.field}>
              <Label htmlFor="feed-category">
                分类 <span className="text-muted-foreground font-normal">（可选）</span>
              </Label>
              <Input
                id="feed-category"
                maxLength={200}
                placeholder="例如：人工智能、工程实践"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                disabled={!!busy}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={() => setAdding(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={!!busy || !url.trim()}>
                {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}添加订阅
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !busy) setEditing(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>编辑订阅源</DialogTitle>
            <DialogDescription>自定义名称和分组，刷新后保留。</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-5.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editing) return;
              void (async () => {
                if (
                  await perform(
                    '保存订阅源',
                    async () => {
                      await saveFeed(
                        feedUpdateSchema.parse({
                          id: editing.id,
                          title: editTitle,
                          category: editCategory,
                        }),
                      );
                    },
                    '订阅源已更新。',
                  )
                )
                  setEditing(null);
              })();
            }}
          >
            <div className={ui.field}>
              <Label htmlFor="edit-feed-title">订阅名称</Label>
              <Input
                id="edit-feed-title"
                required
                maxLength={500}
                value={editTitle}
                disabled={!!busy}
                onChange={(event) => setEditTitle(event.target.value)}
              />
            </div>
            <div className={ui.field}>
              <Label htmlFor="edit-feed-category">分组</Label>
              <Input
                id="edit-feed-category"
                maxLength={200}
                value={editCategory}
                disabled={!!busy}
                onChange={(event) => setEditCategory(event.target.value)}
                list="feed-categories"
              />
              <datalist id="feed-categories">
                {groups.filter(Boolean).map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={!!busy}
                onClick={() => setEditing(null)}
              >
                取消
              </Button>
              <Button type="submit" disabled={!!busy || !editTitle.trim()}>
                保存订阅
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>删除这个订阅源？</DialogTitle>
            <DialogDescription>
              「{deleting?.title}
              」及其已缓存文章将被删除。已归档日报及其来源快照会保留。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={!!busy} onClick={() => setDeleting(null)}>
              保留订阅
            </Button>
            <Button
              variant="destructive"
              disabled={!!busy}
              onClick={() =>
                void (async () => {
                  if (
                    deleting &&
                    (await perform(
                      '删除订阅源',
                      async () => {
                        await rpc.feeds.remove({ id: deleting.id });
                      },
                      '订阅源已删除。',
                    ))
                  )
                    setDeleting(null);
                })()
              }
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
