import { and, count, desc, eq, getTableColumns, gte, lt, inArray, sql } from 'drizzle-orm';
import type {
  Article,
  Feed,
  ArticleUpdate,
  MarkArticlesRead,
  FeedUpdate,
} from '@daily-signal/domain';
import { filterArticles } from '@daily-signal/domain/reader';
import { HttpError } from '@daily-signal/domain/errors';
import { db } from '@daily-signal/database';
import { articles, feeds } from '@daily-signal/database/schema';

export function listFeeds(): Feed[] {
  return db
    .select({
      ...getTableColumns(feeds),
      title: sql<string>`coalesce(${feeds.customTitle}, ${feeds.title})`,
      articleCount: count(articles.id),
      unreadCount: sql<number>`coalesce(sum(case when ${articles.id} is not null and ${articles.readAt} is null then 1 else 0 end), 0)`,
    })
    .from(feeds)
    .leftJoin(articles, eq(articles.feedId, feeds.id))
    .groupBy(feeds.id)
    .orderBy(desc(feeds.createdAt))
    .all();
}

export function listArticles(startAt?: string, endAt?: string): Article[] {
  const query = db
    .select({
      ...getTableColumns(articles),
      feedTitle: sql<string>`coalesce(${feeds.customTitle}, ${feeds.title})`,
    })
    .from(articles)
    .innerJoin(feeds, eq(feeds.id, articles.feedId))
    .where(
      startAt && endAt
        ? and(gte(articles.publishedAt, startAt), lt(articles.publishedAt, endAt))
        : undefined,
    )
    .orderBy(desc(articles.publishedAt), articles.id);
  return query.all();
}

export function removeFeed(id: string): void {
  const result = db.delete(feeds).where(eq(feeds.id, id)).run();
  if (!result.changes) throw new HttpError(404, '订阅源不存在。');
}

export function updateFeed(input: FeedUpdate): Feed {
  const result = db
    .update(feeds)
    .set({ customTitle: input.title, category: input.category })
    .where(eq(feeds.id, input.id))
    .run();
  if (!result.changes) throw new HttpError(404, '订阅源不存在。');
  return listFeeds().find((feed) => feed.id === input.id)!;
}

export function updateArticle(input: ArticleUpdate): Article {
  const result = db
    .update(articles)
    .set({
      ...(input.read === undefined ? {} : { readAt: input.read ? new Date().toISOString() : null }),
      ...(input.starred === undefined ? {} : { starred: input.starred }),
    })
    .where(eq(articles.id, input.id))
    .run();
  if (!result.changes) throw new HttpError(404, '文章不存在。');
  return db
    .select({
      ...getTableColumns(articles),
      feedTitle: sql<string>`coalesce(${feeds.customTitle}, ${feeds.title})`,
    })
    .from(articles)
    .innerJoin(feeds, eq(feeds.id, articles.feedId))
    .where(eq(articles.id, input.id))
    .get()!;
}

export function markArticlesRead(input: MarkArticlesRead): { updated: number } {
  return db.transaction((tx) => {
    const ids = filterArticles(listArticles(), listFeeds(), input.filter)
      .filter((article) => Boolean(article.readAt) !== input.read)
      .map((article) => article.id);
    const readAt = input.read ? new Date().toISOString() : null;
    let updated = 0;
    for (let index = 0; index < ids.length; index += 400) {
      updated += tx
        .update(articles)
        .set({ readAt })
        .where(inArray(articles.id, ids.slice(index, index + 400)))
        .run().changes;
    }
    return { updated };
  });
}
