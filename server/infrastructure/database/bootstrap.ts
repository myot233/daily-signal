import type Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import {
  providerModelCapabilitiesSchema,
  providerModelOptionsSchema,
  providerOptionsSchema,
} from '../../../shared/providers/schemas';
import { defaultTemplate } from '../../modules/settings/defaults';
import { providerCredentials, providerModels, providers, settings } from './schema';

export function bootstrapDatabase(db: BetterSQLite3Database, sqlite: Database.Database): void {
  migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../drizzle', import.meta.url)) });
  const insertedSettings = db
    .insert(settings)
    .values({
      id: 1,
      value: {
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        template: defaultTemplate,
        deepseekThinking: 'disabled',
      },
    })
    .onConflictDoNothing()
    .run();

  // Older databases are migrated in SQL. Bootstrap only when this process
  // inserted the settings singleton, so deleting every connection stays deleted.
  if (!insertedSettings.changes) return;

  const migratedProviderId = '00000000-0000-4000-8000-000000000001';
  const migratedModelId = '00000000-0000-4000-8000-000000000002';
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error('模型配置不存在');
  const now = new Date().toISOString();
  const host = new URL(row.value.baseUrl).hostname;
  const presetId =
    host === 'api.openai.com' ? 'openai' : host === 'api.deepseek.com' ? 'deepseek' : 'custom';
  const name =
    presetId === 'openai'
      ? 'OpenAI · 默认'
      : presetId === 'deepseek'
        ? 'DeepSeek · 默认'
        : '已有连接 · 默认';
  sqlite.transaction(() => {
    db.insert(providers)
      .values({
        id: migratedProviderId,
        presetId,
        name,
        protocol: 'openai-chat-completions',
        baseUrl: row.value.baseUrl,
        enabled: true,
        options: providerOptionsSchema.parse({
          deepseekThinking: row.value.deepseekThinking,
          maxOutputTokens: row.value.deepseekThinking === 'enabled' ? 16_384 : 6_000,
        }),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(providerModels)
      .values({
        id: migratedModelId,
        providerId: migratedProviderId,
        modelId: row.value.model,
        displayName: null,
        enabled: true,
        capabilities: providerModelCapabilitiesSchema.parse({}),
        options: providerModelOptionsSchema.parse({}),
        source: 'migration',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    if (row.apiKey)
      db.insert(providerCredentials)
        .values({ providerId: migratedProviderId, apiKey: row.apiKey, updatedAt: now })
        .run();
    db.update(settings)
      .set({ defaultProviderModelId: migratedModelId, apiKey: null })
      .where(eq(settings.id, 1))
      .run();
  })();
}
