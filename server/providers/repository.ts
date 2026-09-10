import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { providerCatalog } from '../../shared/providers/catalog';
import {
  providerCreateSchema, providerModelCapabilitiesSchema, providerModelOptionsSchema,
  providerOptionsSchema, providerUpdateSchema,
} from '../../shared/providers/schemas';
import type { ProviderCreateInput, ProviderModelSaveInput, ProviderUpdateInput } from '../../shared/providers/schemas';
import type { ProviderCheck } from '../../shared/providers/schemas';
import { db, listProviders, sqlite } from '../db';
import { providerChecks, providerCredentials, providerModels, providers, settings } from '../schema';
import { HttpError } from '../errors';
import { normalizePublicUrl } from '../network';

function validatePublicProviderUrl(value: string): string {
  const normalized = normalizePublicUrl(value);
  if (new URL(normalized).protocol !== 'https:') throw new HttpError(400, '模型服务必须使用公开 HTTPS 地址。');
  return normalized.replace(/\/+$/, '');
}

export function getProvider(providerId: string) {
  const provider = db.select().from(providers).where(eq(providers.id, providerId)).get();
  if (!provider) throw new HttpError(404, '连接不存在。');
  return { ...provider, options: providerOptionsSchema.parse(provider.options) };
}

export function getProviderCredential(providerId: string): string | null {
  return db.select({ apiKey: providerCredentials.apiKey }).from(providerCredentials)
    .where(eq(providerCredentials.providerId, providerId)).get()?.apiKey ?? null;
}

export function createProvider(rawInput: ProviderCreateInput) {
  const input = providerCreateSchema.parse(rawInput);
  const baseUrl = validatePublicProviderUrl(input.baseUrl);
  const id = randomUUID();
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    db.insert(providers).values({
      id, presetId: input.presetId, name: input.name, protocol: input.protocol, baseUrl, enabled: input.enabled,
      options: input.options, revision: 1, createdAt: now, updatedAt: now,
    }).run();
    if (input.credential) db.insert(providerCredentials).values({ providerId: id, apiKey: input.credential, updatedAt: now }).run();
    if (input.initialModelId) db.insert(providerModels).values({
      id: randomUUID(), providerId: id, modelId: input.initialModelId, displayName: null, enabled: true,
      capabilities: providerModelCapabilitiesSchema.parse({}), options: providerModelOptionsSchema.parse({}), source: 'manual',
      createdAt: now, updatedAt: now,
    }).run();
  })();
  return listProviders().find(provider => provider.id === id)!;
}

export function updateProvider(rawInput: ProviderUpdateInput) {
  const input = providerUpdateSchema.parse(rawInput);
  const existing = getProvider(input.id);
  const baseUrl = validatePublicProviderUrl(input.baseUrl);
  if (existing.revision !== input.revision) throw new HttpError(409, '连接已在其他页面修改，请重新读取后再保存。');
  const defaultId = db.select({ id: settings.defaultProviderModelId }).from(settings).where(eq(settings.id, 1)).get()?.id;
  if (!input.enabled && defaultId) {
    const selected = db.select().from(providerModels).where(and(eq(providerModels.id, defaultId), eq(providerModels.providerId, input.id))).get();
    if (selected) throw new HttpError(409, '这是当前默认连接。请先选择其他默认模型或清空默认选择。');
  }
  const targetChanged = baseUrl !== existing.baseUrl || input.protocol !== existing.protocol;
  const nextRevision = existing.revision + 1;
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const result = db.update(providers).set({
      presetId: input.presetId, name: input.name, protocol: input.protocol, baseUrl, enabled: input.enabled,
      options: input.options, revision: nextRevision, updatedAt: now,
    }).where(and(eq(providers.id, input.id), eq(providers.revision, input.revision))).run();
    if (!result.changes) throw new HttpError(409, '连接已在其他页面修改，请重新读取后再保存。');
    if (input.credential === null || (targetChanged && input.credential === undefined)) {
      db.delete(providerCredentials).where(eq(providerCredentials.providerId, input.id)).run();
    } else if (input.credential !== undefined) {
      db.insert(providerCredentials).values({ providerId: input.id, apiKey: input.credential, updatedAt: now })
        .onConflictDoUpdate({ target: providerCredentials.providerId, set: { apiKey: input.credential, updatedAt: now } }).run();
    }
  })();
  return listProviders().find(provider => provider.id === input.id)!;
}

export function removeProvider(id: string, revision: number) {
  const existing = getProvider(id);
  if (existing.revision !== revision) throw new HttpError(409, '连接已在其他页面修改，请重新读取后再删除。');
  const defaultId = db.select({ id: settings.defaultProviderModelId }).from(settings).where(eq(settings.id, 1)).get()?.id;
  if (defaultId && db.select().from(providerModels).where(and(eq(providerModels.id, defaultId), eq(providerModels.providerId, id))).get()) {
    throw new HttpError(409, '这是当前默认连接。请先选择其他默认模型或清空默认选择。');
  }
  const result = db.delete(providers).where(and(eq(providers.id, id), eq(providers.revision, revision))).run();
  if (!result.changes) throw new HttpError(409, '连接已被修改或删除。');
}

export function saveProviderModel(input: ProviderModelSaveInput) {
  getProvider(input.providerId);
  const existing = db.select().from(providerModels).where(and(
    eq(providerModels.providerId, input.providerId), eq(providerModels.modelId, input.modelId),
  )).get();
  const now = new Date().toISOString();
  if (existing) {
    const defaultId = db.select({ id: settings.defaultProviderModelId }).from(settings).where(eq(settings.id, 1)).get()?.id;
    if (!input.enabled && defaultId === existing.id) {
      throw new HttpError(409, '这是当前默认模型。请先选择其他默认模型或清空默认选择。');
    }
    db.update(providerModels).set({ displayName: input.displayName || null, enabled: input.enabled, source: existing.source, updatedAt: now })
      .where(eq(providerModels.id, existing.id)).run();
    return listProviders().find(provider => provider.id === input.providerId)!.models.find(model => model.id === existing.id)!;
  }
  const id = randomUUID();
  db.insert(providerModels).values({
    id, providerId: input.providerId, modelId: input.modelId, displayName: input.displayName || null, enabled: input.enabled,
    capabilities: providerModelCapabilitiesSchema.parse({}), options: providerModelOptionsSchema.parse({ displayName: input.displayName || undefined }),
    source: input.source, createdAt: now, updatedAt: now,
  }).run();
  return listProviders().find(provider => provider.id === input.providerId)!.models.find(model => model.id === id)!;
}

export function removeProviderModel(id: string) {
  const defaultId = db.select({ id: settings.defaultProviderModelId }).from(settings).where(eq(settings.id, 1)).get()?.id;
  if (defaultId === id) throw new HttpError(409, '这是当前默认模型。请先选择其他默认模型或清空默认选择。');
  const result = db.delete(providerModels).where(eq(providerModels.id, id)).run();
  if (!result.changes) throw new HttpError(404, '模型不存在。');
}

export function setDefaultProviderModel(id: string | null) {
  if (id) {
    const selected = db.select({ provider: providers, model: providerModels }).from(providerModels)
      .innerJoin(providers, eq(providers.id, providerModels.providerId)).where(eq(providerModels.id, id)).get();
    if (!selected) throw new HttpError(404, '模型不存在。');
    if (!selected.provider.enabled || !selected.model.enabled) throw new HttpError(409, '停用的连接或模型不能设为默认。');
  }
  db.update(settings).set({ defaultProviderModelId: id }).where(eq(settings.id, 1)).run();
}

export interface ProviderSnapshot {
  provider: ReturnType<typeof getProvider>;
  model: typeof providerModels.$inferSelect;
  apiKey: string;
  template: string;
}

export function resolveProviderSnapshot(providerModelId?: string, overrideKey?: string): ProviderSnapshot {
  const settingRow = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!settingRow) throw new HttpError(500, '应用设置不存在。');
  const id = providerModelId ?? settingRow.defaultProviderModelId;
  if (!id) throw new HttpError(400, '请先选择日报默认模型。');
  const selected = db.select({ provider: providers, model: providerModels }).from(providerModels)
    .innerJoin(providers, eq(providers.id, providerModels.providerId)).where(eq(providerModels.id, id)).get();
  if (!selected) throw new HttpError(400, '所选模型已不存在，请重新选择。');
  if (!selected.provider.enabled || !selected.model.enabled) throw new HttpError(400, '所选连接或模型已停用，请重新选择。');
  const apiKey = overrideKey ?? getProviderCredential(selected.provider.id);
  if (!apiKey) throw new HttpError(400, '所选连接尚未保存 API Key。');
  return {
    provider: { ...selected.provider, options: providerOptionsSchema.parse(selected.provider.options) },
    model: selected.model,
    apiKey,
    template: settingRow.value.template,
  };
}

export function replaceLegacyDefaultConnection(value: { baseUrl: string; model: string; deepseekThinking: 'enabled' | 'disabled' }, credential: string | null | undefined) {
  const row = db.select().from(settings).where(eq(settings.id, 1)).get();
  if (!row?.defaultProviderModelId) throw new HttpError(409, '尚未选择默认模型，旧版设置接口不能确定要修改哪条连接。');
  const model = db.select().from(providerModels).where(eq(providerModels.id, row.defaultProviderModelId)).get();
  if (!model) throw new HttpError(409, '默认模型已不存在。');
  const provider = getProvider(model.providerId);
  const targetChanged = value.baseUrl !== provider.baseUrl;
  const modelChanged = value.model !== model.modelId;
  sqlite.transaction(() => {
    db.update(providers).set({
      baseUrl: validatePublicProviderUrl(value.baseUrl),
      protocol: targetChanged || modelChanged ? 'openai-chat-completions' : provider.protocol,
      options: { ...provider.options, deepseekThinking: value.deepseekThinking }, revision: provider.revision + 1,
      updatedAt: new Date().toISOString(),
    }).where(eq(providers.id, provider.id)).run();
    if (modelChanged) db.update(providerModels).set({ modelId: value.model, updatedAt: new Date().toISOString() }).where(eq(providerModels.id, model.id)).run();
    if (credential === null || (targetChanged && credential === undefined)) db.delete(providerCredentials).where(eq(providerCredentials.providerId, provider.id)).run();
    else if (credential !== undefined) db.insert(providerCredentials).values({ providerId: provider.id, apiKey: credential, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: providerCredentials.providerId, set: { apiKey: credential, updatedAt: new Date().toISOString() } }).run();
  })();
}

export function catalogResponse() {
  return providerCatalog.map(preset => ({ ...preset, protocols: [...preset.protocols] }));
}

export function recordProviderChecks(providerId: string, modelId: string, configRevision: number, checks: Array<Pick<ProviderCheck, 'stage' | 'status' | 'latencyMs' | 'safeError'>>) {
  const checkedAt = new Date().toISOString();
  const rows = checks.map(check => ({
    id: randomUUID(), providerId, modelId, configRevision, checkedAt, ...check,
  }));
  // A connection may be deleted while its network call is in flight. The
  // caller still receives the result, but there is no longer a parent row to persist it under.
  if (db.select({ id: providers.id }).from(providers).where(eq(providers.id, providerId)).get()) {
    db.insert(providerChecks).values(rows).run();
  }
  return rows;
}
