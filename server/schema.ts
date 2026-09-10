import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Article, Settings } from '../shared/types';
import type { ProviderModelCapabilities, ProviderModelOptions, ProviderOptions } from '../shared/providers/schemas';
import type { ProviderProtocol } from '../shared/providers/catalog';

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
  defaultProviderModelId: text('default_provider_model_id').references(() => providerModels.id, { onDelete: 'set null' }),
});
export const digests = sqliteTable('digests', {
  id: text('id').primaryKey(), date: text('date').notNull(), title: text('title').notNull(),
  markdown: text('markdown').notNull(), createdAt: text('created_at').notNull(),
  articleCount: integer('article_count').notNull(), model: text('model').notNull(),
  sources: text('sources', { mode: 'json' }).$type<Article[]>().notNull(),
  providerId: text('provider_id'), providerName: text('provider_name'), providerProtocol: text('provider_protocol').$type<ProviderProtocol>(),
  providerModelId: text('provider_model_id'), providerOptions: text('provider_options', { mode: 'json' }).$type<ProviderOptions>(),
});

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(), presetId: text('preset_id').notNull(), name: text('name').notNull(),
  protocol: text('protocol').$type<ProviderProtocol>().notNull(), baseUrl: text('base_url').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  options: text('options', { mode: 'json' }).$type<ProviderOptions>().notNull(),
  revision: integer('revision').notNull().default(1), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
});
export const providerCredentials = sqliteTable('provider_credentials', {
  providerId: text('provider_id').primaryKey().references(() => providers.id, { onDelete: 'cascade' }),
  apiKey: text('api_key').notNull(), updatedAt: text('updated_at').notNull(),
});
export const providerModels = sqliteTable('provider_models', {
  id: text('id').primaryKey(), providerId: text('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(), displayName: text('display_name'), enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  capabilities: text('capabilities', { mode: 'json' }).$type<ProviderModelCapabilities>().notNull(),
  options: text('options', { mode: 'json' }).$type<ProviderModelOptions>().notNull(), source: text('source').notNull(),
  createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, table => [uniqueIndex('provider_models_provider_model').on(table.providerId, table.modelId), index('provider_models_provider').on(table.providerId)]);
export const providerChecks = sqliteTable('provider_checks', {
  id: text('id').primaryKey(), providerId: text('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
  modelId: text('model_id'), configRevision: integer('config_revision').notNull(),
  stage: text('stage').notNull(), status: text('status').notNull(), latencyMs: integer('latency_ms').notNull(),
  checkedAt: text('checked_at').notNull(), safeError: text('safe_error'),
}, table => [index('provider_checks_provider').on(table.providerId, table.checkedAt)]);
