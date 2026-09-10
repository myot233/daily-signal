import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { and, count, desc, eq, getTableColumns, gte, lt } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppState, Article, Feed, Settings } from '../shared/types';
import { articles, digests, feeds, settings } from './schema';

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
db.insert(settings).values({ id: 1, value: {
  baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', template: defaultTemplate, deepseekThinking: 'disabled',
} }).onConflictDoNothing().run();

export function getSettings(): Settings {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error('模型配置不存在');
  return row.value;
}
export function getApiKey(): string | null {
  return db.select({ apiKey: settings.apiKey }).from(settings).where(eq(settings.id, 1)).get()?.apiKey ?? null;
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
  return {
    feeds: listFeeds(), articles: listArticles(),
    digests: db.select().from(digests).orderBy(desc(digests.createdAt)).all(),
    settings: getSettings(), hasApiKey: Boolean(getApiKey()), defaultTemplate,
  };
}
