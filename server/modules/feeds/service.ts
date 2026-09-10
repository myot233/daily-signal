import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Feed, ImportResult, RefreshResult } from '../../../shared/types';
import { db } from '../../infrastructure/database/client';
import { articles, feeds } from '../../infrastructure/database/schema';
import { HttpError } from '../../core/errors';
import {
  fetchPublicText,
  normalizePublicUrl,
  PublicFetchError,
} from '../../infrastructure/network/public-fetch';
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

async function concurrent<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, items.length) }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

function ingest(tx: Transaction, feedId: string, incoming: ParsedArticle[]): number {
  const previous = new Map(
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
        return { ...row, articleCount };
      });
    } catch (error) {
      throw sourceError(error);
    }
  }

  async function refreshFeeds(): Promise<RefreshResult> {
    const result: RefreshResult = { added: 0, errors: [] };
    await concurrent(listFeeds(), async (feed) => {
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
      }
    });
    return result;
  }

  async function importOpml(xml: string): Promise<ImportResult> {
    const candidates = parseOpml(xml);
    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
    const seen = new Set(listFeeds().map((feed) => feed.url));
    const pending: { url: string; category: string }[] = [];
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
    await concurrent(pending, async (candidate) => {
      try {
        await addFeed(candidate.url, candidate.category);
        result.imported++;
      } catch (error) {
        if (error instanceof HttpError && error.status === 409) result.skipped++;
        else result.errors.push({ url: candidate.url, error: sourceError(error).message });
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
