import { ui } from '@daily-signal/ui/styles';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, LoaderCircle, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Button } from '@daily-signal/ui/button';
import { Input } from '@daily-signal/ui/input';
import { Label } from '@daily-signal/ui/label';
import { Badge } from '@daily-signal/ui/badge';
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
  importOpmlSchema,
  type Feed,
  type ImportResult,
} from '@daily-signal/domain';
import { CachedFeedIcon } from './FeedIcon';
import { ArticlesView } from './ArticlesView';

export function FeedsView({
  state,
  busy,
  perform,
  notify,
  refresh,
  refreshing = false,
  navigate,
}: ViewProps & { refresh: () => void; refreshing?: boolean; navigate: (view: View) => void }) {
  const [feedId, setFeedId] = useState('');
  const selectedFeedId = state.feeds.some((feed) => feed.id === feedId) ? feedId : '';
  const articlePane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    articlePane.current?.scrollTo({ top: 0 });
  }, [selectedFeedId]);
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('');
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
      notify({
        kind: result.errors.length ? 'warning' : 'success',
        message: `订阅已导入：新增 ${result.imported} 个，跳过 ${result.skipped} 个，失败 ${result.errors.length} 个。${result.imported ? '文章正在后台抓取。' : ''}`,
      });
    });
  }
  return (
    <section className="subscriptions-workspace">
      <div className={ui.viewHeading}>
        <h1>订阅与文章</h1>
        <Button disabled={!!busy} onClick={() => setAdding(true)}>
          <Plus />
          添加订阅源
        </Button>
      </div>
      <div className="subscription-toolbar">
        <span className="inline-flex gap-2.5 items-center text-[12px] font-semibold">
          我的订阅 <Badge variant="secondary">{state.feeds.length}</Badge>
        </span>
        <div className="button-row flex items-center flex-wrap gap-1.75">
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
        </div>
      </div>
      {importResult && (
        <div
          className={`border py-3.5 px-4.25 rounded-[7px] mb-5.5 text-[12px] leading-[1.8] wrap-anywhere [&.success]:bg-[#edf2e8] [&.success]:text-[#4d6542] [&.success]:border-[#d5e0cc] [&.warning]:bg-[#f7efdc] [&.warning]:text-[#826426] [&.warning]:border-[#e8d8b2] [&.error]:bg-[#f9eae3] [&.error]:text-[#a14536] [&.error]:border-[#edc8ba] [&_ul]:pl-5 [&_ul]:list-disc [&_ul]:mt-2 [&_ul]:mx-0 [&_ul]:mb-0 [&_details]:mt-1.5 [&_>_button]:mt-2 ${importResult.errors.length ? 'warning' : 'success'}`}
        >
          <p>
            OPML 导入结果：新增 {importResult.imported} 个 · 跳过 {importResult.skipped} 个 · 失败{' '}
            {importResult.errors.length} 个
          </p>
          {importResult.errors.length > 0 && (
            <ul>
              {importResult.errors.map((item, index) => (
                <li key={index}>
                  <strong>{item.url || '未知订阅源'}</strong>：{item.error}
                </li>
              ))}
            </ul>
          )}
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
              <BookOpen size={17} aria-hidden="true" />
              <span className="subscription-source-name">全部文章</span>
              <span className="subscription-count">{state.articles.length}</span>
            </button>
            {state.feeds.map((feed) => (
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
                    <span className="subscription-source-category">
                      {feed.error ? '刷新失败' : feed.category || '未分类'}
                    </span>
                  </span>
                  <span className="subscription-count">{feed.articleCount}</span>
                </button>
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
