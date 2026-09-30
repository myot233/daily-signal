import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { contract } from '@daily-signal/contracts';
import { eq } from 'drizzle-orm';

// Test-only loading boundary: configure isolated storage before loading the app.
process.env.DATABASE_PATH = ':memory:';
const { createApp } = await import('../index');
const server = createServer(createApp());
let baseUrl: string;
let rpc: ContractRouterClient<typeof contract>;
before(async () => {
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  rpc = createORPCClient(new RPCLink({ url: `${baseUrl}/rpc` }));
});
after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('typed oRPC client persists settings and returns the Zod-defined state', async () => {
  const initial = await rpc.state();
  const value = { ...initial.settings, model: 'contract-model' };
  const saved = await rpc.settings.save(value);
  const reloaded = await rpc.state();
  assert.equal(saved.model, 'contract-model');
  assert.equal(reloaded.settings.model, saved.model);
  assert.equal(reloaded.defaultTemplate, initial.defaultTemplate);
});

test('automation settings preserve templates and provider credentials, including with no default model', async () => {
  const initial = await rpc.state();
  const provider = await rpc.providers.create({
    presetId: 'custom',
    name: 'Automation connection',
    protocol: 'anthropic-messages',
    baseUrl: 'https://automation.example.com/v1',
    enabled: true,
    credential: 'AUTOMATION-PRIVATE-KEY',
    initialModelId: 'automation-model',
  });
  await rpc.defaultModel.set({ providerModelId: provider.models[0]!.id });
  const before = await rpc.state();
  const saved = await rpc.settings.saveAutomation({
    autoDigest: { enabled: true, time: '21:30' },
    feedRefresh: { intervalMinutes: 30 },
  });
  const reloaded = await rpc.state();
  assert.deepEqual(reloaded.settings, saved);
  assert.equal(saved.template, before.settings.template);
  assert.deepEqual(saved.curation, before.settings.curation);
  assert.deepEqual(reloaded.providers, before.providers);
  const { getApiKey } = await import('@daily-signal/settings');
  assert.equal(getApiKey(), 'AUTOMATION-PRIVATE-KEY');
  assert.equal(JSON.stringify(reloaded).includes('AUTOMATION-PRIVATE-KEY'), false);
  await rpc.settings.saveAutomation({
    autoDigest: { enabled: false, time: '21:30' },
    feedRefresh: { intervalMinutes: 0 },
  });
  await rpc.defaultModel.set({ providerModelId: null });
  await rpc.providers.remove({ id: provider.id, revision: provider.revision });
  const noModel = await rpc.settings.saveAutomation({
    autoDigest: { enabled: false, time: '20:00' },
    feedRefresh: { intervalMinutes: 60 },
  });
  assert.equal(noModel.feedRefresh.intervalMinutes, 60);
  await rpc.defaultModel.set({ providerModelId: initial.defaultProviderModelId });
  await rpc.settings.saveAutomation({
    autoDigest: initial.settings.autoDigest,
    feedRefresh: initial.settings.feedRefresh,
  });
});

test('invalid automation input and missing credentials cannot change saved settings', async () => {
  const initial = await rpc.state();
  await rpc.defaultModel.set({ providerModelId: null });
  const before = (await rpc.state()).settings;
  await assert.rejects(
    rpc.settings.saveAutomation({
      autoDigest: { enabled: true, time: '20:00' },
      feedRefresh: { intervalMinutes: 15 },
    }),
    { code: 'BAD_REQUEST' },
  );
  await rpc.defaultModel.set({ providerModelId: initial.defaultProviderModelId });
  await assert.rejects(
    rpc.settings.saveAutomation({
      autoDigest: { enabled: true, time: '20:00' },
      feedRefresh: { intervalMinutes: 15 },
    }),
    { code: 'BAD_REQUEST' },
  );
  for (const input of [
    { autoDigest: { enabled: false, time: '25:00' }, feedRefresh: { intervalMinutes: 15 } },
    { autoDigest: before.autoDigest, feedRefresh: { intervalMinutes: 1 } },
    {
      autoDigest: before.autoDigest,
      feedRefresh: before.feedRefresh,
      apiKey: 'FORBIDDEN-PREFERENCE-KEY',
    },
  ]) {
    const response = await fetch(`${baseUrl}/rpc/settings/saveAutomation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: input }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.text()).includes('FORBIDDEN-PREFERENCE-KEY'), false);
  }
  assert.deepEqual((await rpc.state()).settings, before);
});

test('typed icon RPC reads local image data, excludes it from app state and rejects missing feeds', async () => {
  const { db } = await import('@daily-signal/database');
  const { feeds, feedIcons } = await import('@daily-signal/database/schema');
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  db.insert(feeds)
    .values({
      id: 'cached-feed',
      title: 'Cached feed',
      url: 'https://icon.example.com/rss',
      siteUrl: 'https://icon.example.com',
      createdAt: '2026-09-28',
    })
    .run();
  db.insert(feedIcons)
    .values({
      url: 'https://icon.example.com/favicon.ico',
      dataUrl,
      nextFetchAt: Date.now() + 60_000,
    })
    .run();
  try {
    assert.equal(await rpc.feeds.icon({ id: 'cached-feed' }), dataUrl);
    assert.equal(JSON.stringify(await rpc.state()).includes(dataUrl), false);
    await assert.rejects(rpc.feeds.icon({ id: 'missing-icon-feed' }), { code: 'NOT_FOUND' });
    await assert.rejects(rpc.feeds.icon({ id: '' }), { code: 'BAD_REQUEST' });
    await rpc.feeds.remove({ id: 'cached-feed' });
    await assert.rejects(rpc.feeds.icon({ id: 'cached-feed' }), { code: 'NOT_FOUND' });
  } finally {
    db.delete(feeds).where(eq(feeds.id, 'cached-feed')).run();
    db.delete(feedIcons).where(eq(feedIcons.url, 'https://icon.example.com/favicon.ico')).run();
  }
});

test('provider key persists privately, survives template edits, can be replaced and cleared', async () => {
  const { db } = await import('@daily-signal/database');
  const { providerCredentials, providerModels, settings } =
    await import('@daily-signal/database/schema');
  const initial = await rpc.state();
  const defaultModelId = db
    .select({ id: settings.defaultProviderModelId })
    .from(settings)
    .get()!.id!;
  const providerId = db
    .select({ id: providerModels.providerId })
    .from(providerModels)
    .where(eq(providerModels.id, defaultModelId))
    .get()!.id;
  const savedKey = () =>
    db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.providerId, providerId))
      .get()?.apiKey ?? null;
  const secret = 'SAVED-PROVIDER-KEY';
  const saved = await rpc.settings.save({ ...initial.settings, apiKey: secret });
  assert.equal(savedKey(), secret);
  assert.equal((await rpc.state()).hasApiKey, true);
  assert.equal(JSON.stringify(saved).includes(secret), false);
  assert.equal(JSON.stringify(await rpc.state()).includes(secret), false);
  const updated = await rpc.settings.save({ ...saved, template: 'Updated template' });
  assert.equal(savedKey(), secret);
  await rpc.settings.save({ ...updated, apiKey: 'REPLACEMENT-KEY' });
  assert.equal(savedKey(), 'REPLACEMENT-KEY');
  await rpc.settings.save({ ...updated, apiKey: null });
  assert.equal((await rpc.state()).hasApiKey, false);
  assert.equal(savedKey(), null);
});

test('changing endpoints never reuses the previous provider credential', async () => {
  const { getApiKey } = await import('@daily-signal/settings');
  const { settings: initial } = await rpc.state();
  await rpc.settings.save({ ...initial, apiKey: 'OLD-PROVIDER-KEY' });
  const changed = await rpc.settings.save({ ...initial, baseUrl: 'https://api.deepseek.com' });
  assert.equal(getApiKey(), null);
  await rpc.settings.save({ ...changed, baseUrl: initial.baseUrl, apiKey: 'NEW-PROVIDER-KEY' });
  assert.equal(getApiKey(), 'NEW-PROVIDER-KEY');
  await rpc.settings.save({ ...initial, apiKey: null });
});

test('invalid keys do not overwrite a previously saved credential', async () => {
  const { getApiKey } = await import('@daily-signal/settings');
  const { settings } = await rpc.state();
  await rpc.settings.save({ ...settings, apiKey: 'VALID-KEY' });
  for (const apiKey of ['', '   ', 'INVALID\nKEY', 'x'.repeat(4097)]) {
    await assert.rejects(rpc.settings.save({ ...settings, apiKey }));
    assert.equal(getApiKey(), 'VALID-KEY');
  }
  await rpc.settings.save({ ...settings, apiKey: null });
});

test('runtime contract rejects unknown fields, malformed input and unknown procedures', async () => {
  const state = await rpc.state();
  const secret = 'NO-SECRET-IN-ERROR-OR-STORAGE';
  const invalid = await fetch(`${baseUrl}/rpc/settings/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { ...state.settings, unknownCredential: secret } }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.text()).includes(secret), false);
  assert.equal(JSON.stringify(await rpc.state()).includes(secret), false);
  const malformed = await fetch(`${baseUrl}/rpc/settings/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  const missing = await fetch(`${baseUrl}/rpc/not-a-procedure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(missing.status, 404);
});

test('local API rejects cross-origin calls, forged Host and oversized bodies', async () => {
  for (const headers of [
    { Origin: 'https://outside.example' },
    { Host: 'outside.example' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ]) {
    // Use raw HTTP: fetch can normalize/replace a caller-supplied Host header.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        `${baseUrl}/rpc/state`,
        { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(status, 403);
  }
  const oversized = await fetch(`${baseUrl}/rpc/settings/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: { template: 'x'.repeat(3 * 1024 * 1024) } }),
  });
  assert.equal(oversized.status, 413);
});

test('missing records and private feed targets return safe typed errors', async () => {
  await assert.rejects(
    rpc.feeds.remove({ id: 'missing' }),
    (error) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'NOT_FOUND',
  );
  await assert.rejects(
    rpc.feeds.add({ url: 'http://127.0.0.1/private' }),
    (error) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'BAD_REQUEST',
  );
  assert.deepEqual((await rpc.state()).feeds, []);
});

test('provider RPC exposes catalog and connection state without credentials', async () => {
  const created = await rpc.providers.create({
    presetId: 'custom',
    name: 'RPC Gateway',
    protocol: 'anthropic-messages',
    baseUrl: 'https://gateway.example.com/v1',
    enabled: true,
    credential: 'RPC-SECRET',
    initialModelId: 'claude-rpc',
  });
  assert.equal(created.hasCredential, true);
  assert.equal(created.models[0]?.modelId, 'claude-rpc');
  assert.equal(JSON.stringify(created).includes('RPC-SECRET'), false);
  const listed = await rpc.providers.list();
  assert.ok(listed.catalog.some((preset) => preset.id === 'openai'));
  assert.equal(JSON.stringify(listed).includes('RPC-SECRET'), false);
  await rpc.defaultModel.set({ providerModelId: created.models[0]!.id });
  await assert.rejects(
    rpc.providers.update({
      id: created.id,
      revision: created.revision,
      presetId: created.presetId,
      name: created.name,
      protocol: created.protocol,
      baseUrl: created.baseUrl,
      enabled: false,
      options: created.options,
    }),
    (error) =>
      typeof error === 'object' && error !== null && 'code' in error && error.code === 'CONFLICT',
  );
  await rpc.defaultModel.set({ providerModelId: null });
  await rpc.providers.remove({ id: created.id, revision: created.revision });
});

test('translation RPC validates bounded text and requires a saved model credential', async () => {
  const provider = await rpc.providers.create({
    presetId: 'custom',
    name: 'Translation without key',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://translation.example.com/v1',
    enabled: true,
    initialModelId: 'test-model',
  });
  const providerModelId = provider.models[0]!.id;
  for (const content of ['', 'x'.repeat(6001)]) {
    const result = await fetch(`${baseUrl}/rpc/ai/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { content, providerModelId } }),
    });
    assert.equal(result.status, 400);
  }
  await assert.rejects(rpc.ai.translate({ content: 'Hello', providerModelId }), /尚未保存 API Key/);
  await rpc.providers.remove({ id: provider.id, revision: provider.revision });
});

test('reader RPC validates changes, persists flags and applies only the filtered batch', async () => {
  const { db } = await import('@daily-signal/database');
  const { feeds, articles } = await import('@daily-signal/database/schema');
  db.insert(feeds)
    .values({
      id: 'reader-feed',
      title: 'Original',
      url: 'https://reader.example.com/rss',
      category: '工程',
      createdAt: '2026-09-30T00:00:00.000Z',
    })
    .run();
  for (const id of ['reader-one', 'reader-two'])
    db.insert(articles)
      .values({
        id,
        feedId: 'reader-feed',
        title: id,
        url: `https://reader.example.com/${id}`,
        content: '正文',
        publishedAt: '2026-09-30T00:00:00.000Z',
      })
      .run();
  try {
    await assert.rejects(rpc.articles.update({ id: 'reader-one' }), { code: 'BAD_REQUEST' });
    await assert.rejects(rpc.articles.update({ id: 'missing-reader', read: true }), {
      code: 'NOT_FOUND',
    });
    await assert.rejects(rpc.feeds.update({ id: 'reader-feed', title: '  ', category: '' }), {
      code: 'BAD_REQUEST',
    });
    const feed = await rpc.feeds.update({ id: 'reader-feed', title: '我的订阅', category: '技术' });
    assert.equal(feed.title, '我的订阅');
    assert.equal(feed.unreadCount, 2);
    const marked = await rpc.articles.update({ id: 'reader-one', starred: true });
    assert.equal(marked.starred, true);
    assert.equal(marked.readAt, null);
    assert.deepEqual(
      await rpc.articles.markRead({
        filter: { feedId: 'reader-feed', query: '', status: 'unread', starredOnly: true },
        read: true,
      }),
      { updated: 1 },
    );
    const state = await rpc.state();
    assert.ok(state.articles.find((article) => article.id === 'reader-one')!.readAt);
    assert.equal(state.articles.find((article) => article.id === 'reader-two')!.readAt, null);
    assert.equal(state.feeds.find((item) => item.id === feed.id)!.unreadCount, 1);
  } finally {
    db.delete(feeds).where(eq(feeds.id, 'reader-feed')).run();
  }
});
