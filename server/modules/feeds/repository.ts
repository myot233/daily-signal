import { and, count, desc, eq, getTableColumns, gte, lt } from 'drizzle-orm';
import type { Article, Feed } from '../../../shared/types';
import { HttpError } from '../../core/errors';
import { db } from '../../infrastructure/database/client';
import { articles, feeds } from '../../infrastructure/database/schema';

export function listFeeds(): Feed[] {
  return db
    .select({ ...getTableColumns(feeds), articleCount: count(articles.id) })
    .from(feeds)
    .leftJoin(articles, eq(articles.feedId, feeds.id))
    .groupBy(feeds.id)
    .orderBy(desc(feeds.createdAt))
    .all();
}

export function listArticles(startAt?: string, endAt?: string): Article[] {
  const query = db
    .select({ ...getTableColumns(articles), feedTitle: feeds.title })
    .from(articles)
    .innerJoin(feeds, eq(feeds.id, articles.feedId))
    .where(
      startAt && endAt
        ? and(gte(articles.publishedAt, startAt), lt(articles.publishedAt, endAt))
        : undefined,
    )
    .orderBy(desc(articles.publishedAt), articles.id);
  return startAt && endAt ? query.all() : query.limit(500).all();
}

export function removeFeed(id: string): void {
  const result = db.delete(feeds).where(eq(feeds.id, id)).run();
  if (!result.changes) throw new HttpError(404, '订阅源不存在。');
}
