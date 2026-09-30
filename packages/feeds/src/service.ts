import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Feed, ImportResult, RefreshResult } from '@daily-signal/domain';
import { db } from '@daily-signal/database';
import { articles, feeds } from '@daily-signal/database/schema';
import { HttpError } from '@daily-signal/domain/errors';
import { fetchPublicText, normalizePublicUrl, PublicFetchError } from '@daily-signal/network';
import { listFeeds } from './repository';
import { categoryValue, normalizeRss, parseRss, type ParsedArticle } from './parser';
import { parseOpml, renderOpml } from './opml';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function sourceError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof PublicFetchError) {
    return new HttpError(
      error.kind === 'timeout' ? 504 : error.kind === 'oversize' ? 413 : 502,
      error.message,
    );
  }
  return new HttpError(502, '无法获取或解析订阅，请检查订阅地址并稍后重试。');
}

function normalizedUrl(value: string): string {
  try {
    return normalizePublicUrl(value);
  } catch {
    throw new HttpError(400, '请输入有效的公开 HTTP(S) 订阅地址，不允许本机、私网或凭据。');
  }
}

async function concurrent<T extends { url: string }>(
  items: T[],
  work: (item: T) => Promise<void>,
): Promise<void> {
  const pending = items.map((item) => ({ item, host: new URL(item.url).hostname }));
  const hosts = new Map<string, number>();
  let active = 0;
  await new Promise<void>((resolve, reject) => {
    let failed = false;
    let failure: unknown;
    function pump() {
      if (failed) {
        if (!active) reject(failure);
        return;
      }
      if (!pending.length && !active) return resolve();
      while (active < 8) {
        const index = pending.findIndex(({ host }) => (hosts.get(host) ?? 0) < 4);
        if (index === -1) return;
        const { item, host } = pending.splice(index, 1)[0]!;
        active++;
        hosts.set(host, (hosts.get(host) ?? 0) + 1);
        void work(item).then(
          () => {
            active--;
            hosts.set(host, hosts.get(host)! - 1);
            pump();
          },
          (error: unknown) => {
            failed = true;
            failure = error;
            active--;
            hosts.set(host, hosts.get(host)! - 1);
            pump();
          },
        );
      }
    }
    pump();
  });
}

function ingest(tx: Transaction, feedId: string, incoming: ParsedArticle[]): number {
  const previous = new Map<string, typeof articles.$inferInsert>(
    tx
      .select()
      .from(articles)
      .where(eq(articles.feedId, feedId))
      .all()
      .map((article) => [article.url, article]),
  );
  let added = 0;
  for (const item of incoming) {
    const existing = previous.get(item.url);
    if (existing) {
      const updated = {
        ...existing,
        title: item.title,
        content: item.content,
        ...(item.dateEstimated ? {} : { publishedAt: item.publishedAt, dateEstimated: false }),
      };
      tx.update(articles).set(updated).where(eq(articles.id, existing.id)).run();
      previous.set(item.url, updated);
    } else {
      const row = { ...item, id: randomUUID(), feedId, dateEstimated: item.dateEstimated ?? false };
      tx.insert(articles).values(row).run();
      previous.set(item.url, row);
      added++;
    }
  }
  return added;
}

// Only ingestion's fetch and clock are injectable. Production callers use the
// exports below, and cannot disable public-network validation with user input.
export function createFeedService(
  dependencies: { fetchText?: typeof fetchPublicText; now?: () => Date } = {},
) {
  const fetchText = dependencies.fetchText ?? fetchPublicText;
  const now = dependencies.now ?? (() => new Date());

  async function load(url: string) {
    const response = await fetchText(url, { timeoutMs: 20_000, maxBytes: 3 * 1024 * 1024 });
    if (!response.ok)
      throw new HttpError(502, `订阅服务器返回 HTTP ${response.status}，请稍后重试。`);
    const parsed = await parseRss(response.text);
    const fetchedAt = now().toISOString();
    return normalizeRss(parsed, url, fetchedAt);
  }

  async function addFeed(value: string, category?: string): Promise<Feed> {
    const url = normalizedUrl(value);
    const normalizedCategory = categoryValue(category);
    if (db.select({ id: feeds.id }).from(feeds).where(eq(feeds.url, url)).get())
      throw new HttpError(409, '这个订阅源已经添加。');
    try {
      const loaded = await load(url);
      return db.transaction((tx) => {
        if (tx.select({ id: feeds.id }).from(feeds).where(eq(feeds.url, url)).get())
          throw new HttpError(409, '这个订阅源已经添加。');
        const row = {
          id: randomUUID(),
          url,
          title: loaded.title,
          category: normalizedCategory,
          siteUrl: loaded.siteUrl,
          createdAt: loaded.fetchedAt,
          lastFetchedAt: loaded.fetchedAt,
          error: null,
        };
        tx.insert(feeds).values(row).run();
        const articleCount = ingest(tx, row.id, loaded.items);
        return { ...row, articleCount, unreadCount: articleCount };
      });
    } catch (error) {
      throw sourceError(error);
    }
  }

  async function refreshFeeds(
    selected: Feed[] = listFeeds(),
    onProgress?: (completed: number, result: RefreshResult) => void,
  ): Promise<RefreshResult> {
    const result: RefreshResult = { added: 0, errors: [] };
    let completed = 0;
    await concurrent(selected, async (feed) => {
      try {
        const loaded = await load(feed.url);
        result.added += db.transaction((tx) => {
          if (!tx.select({ id: feeds.id }).from(feeds).where(eq(feeds.id, feed.id)).get()) return 0;
          const added = ingest(tx, feed.id, loaded.items);
          tx.update(feeds)
            .set({
              title: loaded.title,
              siteUrl: loaded.siteUrl,
              lastFetchedAt: loaded.fetchedAt,
              error: null,
            })
            .where(eq(feeds.id, feed.id))
            .run();
          return added;
        });
      } catch (error) {
        const message = sourceError(error).message;
        const updated = db.update(feeds).set({ error: message }).where(eq(feeds.id, feed.id)).run();
        if (updated.changes) result.errors.push({ url: feed.url, error: message });
      } finally {
        onProgress?.(++completed, result);
      }
    });
    return result;
  }

  async function importOpml(xml: string): Promise<ImportResult> {
    const candidates = parseOpml(xml);
    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
    const seen = new Set(
      db
        .select({ url: feeds.url })
        .from(feeds)
        .all()
        .map((feed) => feed.url),
    );
    const pending: { url: string; category: string; title: string }[] = [];
    for (const candidate of candidates) {
      let url: string;
      try {
        url = normalizedUrl(candidate.url);
      } catch (error) {
        result.errors.push({ url: candidate.url, error: sourceError(error).message });
        continue;
      }
      if (seen.has(url)) {
        result.skipped++;
        continue;
      }
      seen.add(url);
      pending.push({ ...candidate, url });
    }
    const createdAt = now().toISOString();
    // Import is local and atomic; network acquisition is a separate background job.
    // Keep unreachable subscriptions so they can be retried instead of silently lost.
    db.transaction((tx) => {
      for (const candidate of pending) {
        tx.insert(feeds)
          .values({
            id: randomUUID(),
            url: candidate.url,
            title: candidate.title || new URL(candidate.url).hostname,
            category: candidate.category,
            siteUrl: '',
            createdAt,
            lastFetchedAt: null,
            error: null,
          })
          .run();
        result.imported++;
      }
    });
    return result;
  }

  return { addFeed, refreshFeeds, importOpml, exportOpml };
}

export function exportOpml(): string {
  return renderOpml(listFeeds());
}

const service = createFeedService();
export const addFeed = service.addFeed;
export const refreshFeeds = service.refreshFeeds;
export const importOpml = service.importOpml;
