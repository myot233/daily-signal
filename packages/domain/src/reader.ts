import { z } from 'zod';
import type { Article, Feed } from './index';

export const articleFilterSchema = z
  .object({
    feedId: z.string().min(1).optional(),
    category: z.string().max(200).optional(),
    query: z.string().trim().max(500).default(''),
    status: z.enum(['all', 'unread', 'read']).default('all'),
    starredOnly: z.boolean().default(false),
  })
  .strict();
export const articleUpdateSchema = z
  .object({
    id: z.string().min(1),
    read: z.boolean().optional(),
    starred: z.boolean().optional(),
  })
  .strict()
  .refine(
    (value) => value.read !== undefined || value.starred !== undefined,
    '请选择要更新的阅读状态。',
  );
export const markArticlesReadSchema = z
  .object({
    filter: articleFilterSchema,
    read: z.boolean(),
  })
  .strict();
export const feedUpdateSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().trim().min(1, '订阅名称不能为空。').max(500),
    category: z.string().trim().max(200),
  })
  .strict();
export type ArticleFilter = z.infer<typeof articleFilterSchema>;
export type ArticleUpdate = z.infer<typeof articleUpdateSchema>;
export type MarkArticlesRead = z.infer<typeof markArticlesReadSchema>;
export type FeedUpdate = z.infer<typeof feedUpdateSchema>;

// One matching rule keeps bulk actions consistent with the visible filters.
export function filterArticles(
  articles: readonly Article[],
  feeds: readonly Feed[],
  filter: ArticleFilter,
): Article[] {
  const feedCategories = new Map(feeds.map((feed) => [feed.id, feed.category]));
  const search = filter.query.trim().toLocaleLowerCase('zh-CN');
  return articles.filter(
    (article) =>
      (!filter.feedId || article.feedId === filter.feedId) &&
      (filter.category === undefined || feedCategories.get(article.feedId) === filter.category) &&
      (filter.status === 'all' || Boolean(article.readAt) === (filter.status === 'read')) &&
      (!filter.starredOnly || article.starred) &&
      (!search ||
        `${article.title}\n${article.content}`.toLocaleLowerCase('zh-CN').includes(search)),
  );
}
