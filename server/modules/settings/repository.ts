import { eq } from 'drizzle-orm';
import { settingsSchema, type Settings } from '../../../shared/types';
import { providerOptionsSchema } from '../../../shared/providers/schemas';
import { db } from '../../infrastructure/database/client';
import {
  providerCredentials,
  providerModels,
  providers,
  settings,
} from '../../infrastructure/database/schema';

export function getSettings(): Settings {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row) throw new Error('模型配置不存在');
  const value = settingsSchema.parse(row.value);
  const selected = row.defaultProviderModelId
    ? db
        .select({ provider: providers, model: providerModels })
        .from(providerModels)
        .innerJoin(providers, eq(providers.id, providerModels.providerId))
        .where(eq(providerModels.id, row.defaultProviderModelId))
        .get()
    : undefined;
  return settingsSchema.parse(
    selected
      ? {
          ...value,
          baseUrl: selected.provider.baseUrl,
          model: selected.model.modelId,
          deepseekThinking: providerOptionsSchema.parse(selected.provider.options).deepseekThinking,
        }
      : value,
  );
}

export function getApiKey(): string | null {
  const row = db
    .select({ defaultProviderModelId: settings.defaultProviderModelId })
    .from(settings)
    .where(eq(settings.id, 1))
    .get();
  if (!row?.defaultProviderModelId) return null;
  return (
    db
      .select({ apiKey: providerCredentials.apiKey })
      .from(providerModels)
      .innerJoin(providerCredentials, eq(providerCredentials.providerId, providerModels.providerId))
      .where(eq(providerModels.id, row.defaultProviderModelId))
      .get()?.apiKey ?? null
  );
}

export function getDefaultProviderModelId(): string | null {
  return (
    db
      .select({ defaultProviderModelId: settings.defaultProviderModelId })
      .from(settings)
      .where(eq(settings.id, 1))
      .get()?.defaultProviderModelId ?? null
  );
}
