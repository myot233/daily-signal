import { maxBy } from 'es-toolkit/array';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleAlert,
  LoaderCircle,
  RefreshCw,
  Rss,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { digestInputSchema } from '../../shared/types';
import { protocolLabels } from '../../shared/providers/catalog';
import { dayBounds, formatDate, localDate } from '../lib/client';
import type { DigestGenerationState, StartDigestGeneration, View, ViewProps } from '../lib/client';
import { ui } from '../lib/ui-styles';
import { Report } from './Report';
import { Task, TaskContent, TaskItem, TaskTrigger } from './ai-elements/task';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

function generationEventLabel(event: DigestGenerationState['events'][number]): string {
  switch (event.type) {
    case 'queued':
      return '任务已写入本地生成队列';
    case 'preparing':
      return `已读取 ${event.articleCount} 篇文章，规划为 ${event.batchCount} 个批次`;
    case 'extracting':
      return `正在提取资料批次 ${event.current}/${event.total}`;
    case 'synthesizing':
      return '正在合成日报正文';
    case 'screening':
      return `筛选 ${event.current}/${event.total} 篇 · 复用 ${event.cached} 篇`;
    case 'clustering':
      return `正在合并 ${event.candidateCount} 篇候选文章的重复事件`;
    case 'enriching':
      return `正在阅读与整理 ${event.current}/${event.total} 条内容`;
    case 'archiving':
      return '正在保存日报与来源快照';
    case 'completed':
      return '日报已生成并归档';
    case 'failed':
      return `生成未完成：${event.message}`;
  }
}

export function TodayView({
  state,
  busy,
  generation,
  startGeneration,
  navigate,
  refresh,
  initialDate = localDate(),
}: ViewProps & {
  generation: DigestGenerationState | null;
  startGeneration: StartDigestGeneration;
  navigate: (view: View) => void;
  refresh: () => void;
  initialDate?: string;
}) {
  const [date, setDate] = useState(initialDate);
  const [now, setNow] = useState(Date.now);
  const [providerModelId, setProviderModelId] = useState(state.defaultProviderModelId ?? '');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const modelChoices = state.providers.flatMap((provider) =>
    provider.enabled
      ? provider.models.filter((model) => model.enabled).map((model) => ({ provider, model }))
      : [],
  );
  const activeProviderModelId = modelChoices.some((choice) => choice.model.id === providerModelId)
    ? providerModelId
    : '';
  const report = maxBy(
    state.digests.filter((item) => item.date === date),
    (item) => Date.parse(item.createdAt),
  );
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const bounds = date ? dayBounds(date) : null;
  const visibleArticles = bounds
    ? state.articles.filter(
        (article) => article.publishedAt >= bounds.startAt && article.publishedAt < bounds.endAt,
      )
    : [];
  const failed = state.feeds.filter((feed) => feed.error);
  const stale = state.feeds.filter(
    (feed) => !feed.lastFetchedAt || now - Date.parse(feed.lastFetchedAt) > 24 * 60 * 60 * 1000,
  );
  const definitelyEmpty = state.articles.length < 500 && visibleArticles.length === 0;
  const selectedModel = modelChoices.find((choice) => choice.model.id === activeProviderModelId);
  const providerHost = selectedModel ? new URL(selectedModel.provider.baseUrl).hostname : null;
  const selectedModelName =
    selectedModel?.model.displayName || selectedModel?.model.modelId || '尚未选择模型';
  const selectedModelContext = selectedModel
    ? `${selectedModel.provider.name} · ${protocolLabels[selectedModel.provider.protocol]}`
    : '前往模型与服务商配置';
  const generating = busy === '生成日报';
  const generationEvents = generation?.events ?? [];
  const latestGenerationEvent = generationEvents.at(-1);
  const canGenerate = Boolean(
    !busy &&
    date &&
    selectedModel?.provider.hasCredential &&
    state.feeds.length &&
    !definitelyEmpty,
  );
  const templateLabel = state.settings.curation.enabled
    ? '兴趣与筛选'
    : state.settings.template === state.defaultTemplate
      ? '默认模板'
      : '自定义模板';

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canGenerate) return;
    const input = digestInputSchema.parse({
      date,
      ...dayBounds(date),
      providerModelId: activeProviderModelId,
    });
    void startGeneration(input);
  }

  return (
    <>
      <div className={ui.viewHeading}>
        <h1>今日简报</h1>
        <span className="text-xs text-muted-foreground">
          {state.feeds.length} 个订阅 · {visibleArticles.length} 篇文章
        </span>
      </div>
      <div className="today-workspace">
        <aside
          className="today-options compact-panel"
          aria-label="日报生成选项"
          aria-busy={generating}
        >
          <form onSubmit={generate} className="grid gap-4">
            <h2>生成日报</h2>
            <div className={ui.field}>
              <Label htmlFor="digest-date">日报日期</Label>
              <Input
                id="digest-date"
                type="date"
                required
                value={date}
                disabled={!!busy}
                onChange={(event) => setDate(event.target.value)}
                title={timezone}
              />
            </div>
            <div className={ui.field}>
              <Label htmlFor="digest-model">模型</Label>
              <select
                id="digest-model"
                className="h-9 w-full min-w-0 rounded-md border border-input bg-paper px-2 text-xs"
                value={activeProviderModelId}
                disabled={!!busy}
                onChange={(event) => setProviderModelId(event.target.value)}
              >
                <option value="">尚未选择模型</option>
                {state.providers
                  .filter((provider) => provider.enabled)
                  .map((provider) => (
                    <optgroup key={provider.id} label={provider.name}>
                      {provider.models
                        .filter((model) => model.enabled)
                        .map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.displayName || model.modelId}
                          </option>
                        ))}
                    </optgroup>
                  ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{visibleArticles.length} 篇缓存文章</span>
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => navigate('template')}
              >
                {templateLabel}
              </button>
            </div>
            {state.settings.curation.enabled && (
              <div className="flex flex-wrap gap-1.5" aria-label="已选兴趣标签">
                {state.settings.curation.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
                <span className="w-full text-xs text-muted-foreground">
                  最多 {state.settings.curation.maxItems} 条 · 每标签最多{' '}
                  {state.settings.curation.maxPerCategory} 条
                </span>
              </div>
            )}
            {selectedModel && !selectedModel.provider.hasCredential && (
              <p className="text-xs leading-relaxed text-destructive">
                缺少 API Key，
                <button type="button" className="underline" onClick={() => navigate('settings')}>
                  前往配置
                </button>
                。
              </p>
            )}
            {!selectedModel && (
              <p className="text-xs text-muted-foreground">
                生成前，请选择一个已启用的连接与模型。
              </p>
            )}
            {definitelyEmpty && state.feeds.length > 0 && (
              <p className="text-xs text-muted-foreground">当天没有文章，请刷新订阅或更换日期。</p>
            )}
            <Button type="submit" disabled={!canGenerate}>
              {generating ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {generating ? '正在生成' : report ? '重新生成一版' : '生成日报'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!!busy || !state.feeds.length}
              onClick={refresh}
            >
              <RefreshCw aria-hidden="true" className={busy === '刷新订阅' ? 'animate-spin' : ''} />
              刷新订阅
            </Button>
            <details className="border-t pt-3 text-xs text-muted-foreground">
              <summary>生成详情</summary>
              <div className="mt-3 grid gap-2">
                {selectedModel && <p>{selectedModelName}</p>}
                <p>{selectedModelContext}</p>
                <p>使用缓存文章，成功后自动归档。失败不会覆盖已有日报。</p>
                <p>内容将发送至 {providerHost ?? '所选服务商'}，可能产生模型费用。</p>
                <p>上限：500 篇文章、30 万字符。</p>
              </div>
            </details>
            {generation && (
              <Task key={generation.sessionId} defaultOpen className="border-t pt-2">
                <div aria-live="polite" aria-atomic="true">
                  <TaskTrigger
                    title={
                      latestGenerationEvent
                        ? generationEventLabel(latestGenerationEvent)
                        : '正在连接本地生成队列'
                    }
                  />
                </div>
                <TaskContent>
                  {generationEvents.length ? (
                    generationEvents.map((item, index) => (
                      <TaskItem
                        key={item.id}
                        className={`flex items-start gap-2 py-1 text-xs ${item.type === 'failed' ? 'text-destructive' : ''}`}
                      >
                        {generating && index === generationEvents.length - 1 ? (
                          <LoaderCircle
                            aria-hidden="true"
                            className="mt-0.5 size-3 shrink-0 animate-spin"
                          />
                        ) : item.type === 'failed' ? (
                          <CircleAlert aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                        ) : (
                          <Check aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                        )}
                        <span>{generationEventLabel(item)}</span>
                      </TaskItem>
                    ))
                  ) : (
                    <TaskItem>等待生成进度…</TaskItem>
                  )}
                  {generating && (
                    <p className="mt-2 text-xs text-muted-foreground" role="status">
                      离开页面后会继续生成。
                    </p>
                  )}
                </TaskContent>
              </Task>
            )}
          </form>
          {(failed.length > 0 || stale.length > 0) && (
            <details className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              <summary>
                {failed.length ? `${failed.length} 个来源刷新失败` : `${stale.length} 个来源待更新`}
              </summary>
              <ul className="mt-2 grid gap-2">
                {state.feeds
                  .filter((feed) => failed.includes(feed) || stale.includes(feed))
                  .map((feed) => (
                    <li key={feed.id}>
                      {feed.title}：{feed.error || '超过 24 小时未更新'}
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </aside>
        <section className="today-output" aria-labelledby="ai-output-title">
          {report ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 id="ai-output-title" className="text-sm font-semibold">
                  最新生成结果
                </h2>
                <Button variant="ghost" size="sm" onClick={() => navigate('archive')}>
                  全部归档
                  <ArrowRight size={13} />
                </Button>
              </div>
              <Report digest={report} />
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 id="ai-output-title" className="text-sm font-semibold">
                  {date ? formatDate(date) : '所选日期'}
                </h2>
                <Badge variant="secondary">未生成</Badge>
              </div>
              {visibleArticles.length ? (
                <div className="compact-panel">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">当日文章</h3>
                    <Button variant="ghost" size="sm" onClick={() => navigate('articles')}>
                      阅读文章
                      <ArrowRight size={13} />
                    </Button>
                  </div>
                  <ul className="divide-y">
                    {visibleArticles.slice(0, 12).map((article) => (
                      <li key={article.id} className="py-3">
                        <button
                          className="text-left text-sm font-medium hover:text-primary"
                          onClick={() => navigate('articles')}
                        >
                          {article.title}
                        </button>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {article.feedTitle} · {article.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="compact-panel">
                  <div className={ui.emptyState}>
                    <BookOpen size={28} strokeWidth={1.5} />
                    <h3>{state.feeds.length ? '当天暂无文章' : '添加订阅开始阅读'}</h3>
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="outline" onClick={() => navigate('feeds')}>
                        <Rss />
                        {state.feeds.length ? '管理订阅' : '添加订阅'}
                      </Button>
                      {!state.hasApiKey && (
                        <Button variant="ghost" onClick={() => navigate('settings')}>
                          <Settings2 />
                          配置模型
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
