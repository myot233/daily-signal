import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { and, count, desc, eq, getTableColumns, gte, inArray, lt } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppState, Article, Feed, Settings } from '../shared/types';
import { providerConnectionSchema, providerModelCapabilitiesSchema, providerModelOptionsSchema, providerOptionsSchema } from '../shared/providers/schemas';
import type { ProviderConnection } from '../shared/providers/schemas';
import { articles, digests, feeds, providerChecks, providerCredentials, providerModels, providers, settings } from './schema';

export const defaultTemplate = `# 今日技术日报

> 用 2–3 句话概括今天最值得注意的技术变化。信息不足时明确说明，不凑数。

## 今日重点
挑选最多 3 条真正重要的变化。每条包含：
### 变化的标题
- **发生了什么**：具体版本、能力、变更或事件；只陈述来源支持的事实。
- **为什么重要**：影响哪些开发者、系统或工作流；推断须标记为「分析」。
- **建议行动**：升级、验证、继续观察或无需行动，并说明理由。
- **来源**：[原文标题](原文链接)。多源报道合并，保留出处。

## 技术动态
按实际内容分组（AI / 开发工具 / 基础设施 / 开源等），用简洁列表汇总其余有价值的信息；每条带来源。不输出空分类。

## 影响与建议
用 Markdown 表格列出「变化 | 影响范围 | 建议」，最多 5 行。突出破坏性变更、安全风险和迁移成本；没有证据不要编造风险。

## 值得跟进
最多 3 个后续观察点，说明还缺什么信息；没有则写「暂无」。

---
用中文写作，保留技术专有名词。避免营销措辞。区分事实和分析。不要把旧闻当作今日发布。RSS 只有摘要时，注明「基于订阅摘要」，不声称读过全文。`;

const dbPath = process.env.DATABASE_PATH ?? resolve('data/daily-signal.sqlite');
if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
export const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
export const db = drizzle(sqlite);
migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
const insertedSettings = db.insert(settings).values({ id: 1, value: {
  baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', template: defaultTemplate, deepseekThinking: 'disabled',
} }).onConflictDoNothing().run();

const migratedProviderId = '00000000-0000-4000-8000-000000000001';
const migratedModelId = '00000000-0000-4000-8000-000000000002';
function ensureDefaultProvider() {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error('模型配置不存在');
  const now = new Date().toISOString();
  const host = new URL(row.value.baseUrl).hostname;
  const presetId = host === 'api.openai.com' ? 'openai' : host === 'api.deepseek.com' ? 'deepseek' : 'custom';
  const name = presetId === 'openai' ? 'OpenAI · 默认' : presetId === 'deepseek' ? 'DeepSeek · 默认' : '已有连接 · 默认';
  sqlite.transaction(() => {
    db.insert(providers).values({
      id: migratedProviderId, presetId, name, protocol: 'openai-chat-completions', baseUrl: row.value.baseUrl,
      enabled: true, options: providerOptionsSchema.parse({
        deepseekThinking: row.value.deepseekThinking,
        maxOutputTokens: row.value.deepseekThinking === 'enabled' ? 16_384 : 6_000,
      }), revision: 1,
      createdAt: now, updatedAt: now,
    }).run();
    db.insert(providerModels).values({
      id: migratedModelId, providerId: migratedProviderId, modelId: row.value.model, displayName: null, enabled: true,
      capabilities: providerModelCapabilitiesSchema.parse({}), options: providerModelOptionsSchema.parse({}), source: 'migration',
      createdAt: now, updatedAt: now,
    }).run();
    if (row.apiKey) db.insert(providerCredentials).values({ providerId: migratedProviderId, apiKey: row.apiKey, updatedAt: now }).run();
    db.update(settings).set({ defaultProviderModelId: migratedModelId, apiKey: null }).where(eq(settings.id, 1)).run();
  })();
}
// Older databases are migrated in SQL. Bootstrap only when this process
// inserted the settings singleton, so deleting every connection stays deleted.
if (insertedSettings.changes) ensureDefaultProvider();

export function listProviders(): ProviderConnection[] {
  const providerRows = db.select().from(providers).orderBy(desc(providers.updatedAt), providers.name).all();
  if (!providerRows.length) return [];
  const ids = providerRows.map(provider => provider.id);
  const modelRows = db.select().from(providerModels).where(inArray(providerModels.providerId, ids)).orderBy(providerModels.modelId).all();
  const credentialIds = new Set(db.select({ providerId: providerCredentials.providerId }).from(providerCredentials)
    .where(inArray(providerCredentials.providerId, ids)).all().map(row => row.providerId));
  const checkRows = db.select().from(providerChecks).where(inArray(providerChecks.providerId, ids))
    .orderBy(desc(providerChecks.checkedAt)).all();
  return providerRows.map(provider => providerConnectionSchema.parse({
    ...provider,
    options: providerOptionsSchema.parse(provider.options),
    hasCredential: credentialIds.has(provider.id),
    models: modelRows.filter(model => model.providerId === provider.id).map(model => ({
      ...model,
      source: model.source,
      capabilities: providerModelCapabilitiesSchema.parse(model.capabilities),
      options: providerModelOptionsSchema.parse(model.options),
    })),
    checks: checkRows.filter(check => check.providerId === provider.id).slice(0, 12),
  }));
}

export function getSettings(): Settings {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error('模型配置不存在');
  const selected = row.defaultProviderModelId ? db.select({ provider: providers, model: providerModels })
    .from(providerModels).innerJoin(providers, eq(providers.id, providerModels.providerId))
    .where(eq(providerModels.id, row.defaultProviderModelId)).get() : undefined;
  return selected ? {
    ...row.value, baseUrl: selected.provider.baseUrl, model: selected.model.modelId,
    deepseekThinking: providerOptionsSchema.parse(selected.provider.options).deepseekThinking,
  } : row.value;
}
export function getApiKey(): string | null {
  const row = db.select({ defaultProviderModelId: settings.defaultProviderModelId })
    .from(settings).where(eq(settings.id, 1)).get();
  if (!row?.defaultProviderModelId) return null;
  return db.select({ apiKey: providerCredentials.apiKey }).from(providerModels)
    .innerJoin(providerCredentials, eq(providerCredentials.providerId, providerModels.providerId))
    .where(eq(providerModels.id, row.defaultProviderModelId)).get()?.apiKey ?? null;
}
export function listFeeds(): Feed[] {
  return db.select({ ...getTableColumns(feeds), articleCount: count(articles.id) })
    .from(feeds).leftJoin(articles, eq(articles.feedId, feeds.id))
    .groupBy(feeds.id).orderBy(desc(feeds.createdAt)).all();
}
export function listArticles(startAt?: string, endAt?: string): Article[] {
  const query = db.select({ ...getTableColumns(articles), feedTitle: feeds.title })
    .from(articles).innerJoin(feeds, eq(feeds.id, articles.feedId))
    .where(startAt && endAt ? and(gte(articles.publishedAt, startAt), lt(articles.publishedAt, endAt)) : undefined)
    .orderBy(desc(articles.publishedAt), articles.id);
  return startAt && endAt ? query.all() : query.limit(500).all();
}
export function getState(): AppState {
  const settingRow = db.select({ defaultProviderModelId: settings.defaultProviderModelId }).from(settings).where(eq(settings.id, 1)).get();
  return {
    feeds: listFeeds(), articles: listArticles(),
    digests: db.select().from(digests).orderBy(desc(digests.createdAt)).all(),
    settings: getSettings(), hasApiKey: Boolean(getApiKey()), defaultTemplate,
    providers: listProviders(), defaultProviderModelId: settingRow?.defaultProviderModelId ?? null,
  };
}
