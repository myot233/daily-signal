import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Article, Settings } from '../shared/types';

export const feeds = sqliteTable('feeds', {
  id: text('id').primaryKey(), url: text('url').notNull().unique(),
  title: text('title').notNull(), category: text('category').notNull().default(''),
  siteUrl: text('site_url').notNull().default(''), createdAt: text('created_at').notNull(),
  lastFetchedAt: text('last_fetched_at'), error: text('error'),
});
export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  feedId: text('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
  title: text('title').notNull(), url: text('url').notNull(), content: text('content').notNull(),
  publishedAt: text('published_at').notNull(),
  dateEstimated: integer('date_estimated', { mode: 'boolean' }).notNull().default(false),
}, table => [uniqueIndex('articles_feed_url').on(table.feedId, table.url), index('articles_date').on(table.publishedAt)]);
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(), value: text('value', { mode: 'json' }).$type<Settings>().notNull(),
  apiKey: text('api_key'),
});
export const digests = sqliteTable('digests', {
  id: text('id').primaryKey(), date: text('date').notNull(), title: text('title').notNull(),
  markdown: text('markdown').notNull(), createdAt: text('created_at').notNull(),
  articleCount: integer('article_count').notNull(), model: text('model').notNull(),
  sources: text('sources', { mode: 'json' }).$type<Article[]>().notNull(),
});
