import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { contract } from '../shared/contract';
import { eq } from 'drizzle-orm';

// Test-only loading boundary: configure isolated storage before loading the app.
process.env.DATABASE_PATH = ':memory:';
const { createApp } = await import('./app');
const server = createServer(createApp());
let baseUrl: string;
let rpc: ContractRouterClient<typeof contract>;
before(async () => {
  await new Promise<void>(resolve => { server.listen(0, '127.0.0.1', resolve); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  rpc = createORPCClient(new RPCLink({ url: `${baseUrl}/rpc` }));
});
after(async () => { await new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); }); });

test('typed oRPC client persists settings and returns the Zod-defined state', async () => {
  const initial = await rpc.state();
  const value = { ...initial.settings, model: 'contract-model' };
  const saved = await rpc.settings.save(value);
  const reloaded = await rpc.state();
  assert.equal(saved.model, 'contract-model');
  assert.equal(reloaded.settings.model, saved.model);
  assert.equal(reloaded.defaultTemplate, initial.defaultTemplate);
});

test('provider key persists privately, survives template edits, can be replaced and cleared', async () => {
  const { db } = await import('./db');
  const { providerCredentials, providerModels, settings } = await import('./schema');
  const initial = await rpc.state();
  const defaultModelId = db.select({ id: settings.defaultProviderModelId }).from(settings).get()!.id!;
  const providerId = db.select({ id: providerModels.providerId }).from(providerModels).where(eq(providerModels.id, defaultModelId)).get()!.id;
  const savedKey = () => db.select().from(providerCredentials).where(eq(providerCredentials.providerId, providerId)).get()?.apiKey ?? null;
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
  const { getApiKey } = await import('./db');
  const { settings: initial } = await rpc.state();
  await rpc.settings.save({ ...initial, apiKey: 'OLD-PROVIDER-KEY' });
  const changed = await rpc.settings.save({ ...initial, baseUrl: 'https://api.deepseek.com' });
  assert.equal(getApiKey(), null);
  await rpc.settings.save({ ...changed, baseUrl: initial.baseUrl, apiKey: 'NEW-PROVIDER-KEY' });
  assert.equal(getApiKey(), 'NEW-PROVIDER-KEY');
  await rpc.settings.save({ ...initial, apiKey: null });
});

test('invalid keys do not overwrite a previously saved credential', async () => {
  const { getApiKey } = await import('./db');
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
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: { ...state.settings, unknownCredential: secret } }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.text()).includes(secret), false);
  assert.equal(JSON.stringify(await rpc.state()).includes(secret), false);
  const malformed = await fetch(`${baseUrl}/rpc/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const missing = await fetch(`${baseUrl}/rpc/not-a-procedure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(missing.status, 404);
});

test('local API rejects cross-origin calls, forged Host and oversized bodies', async () => {
  for (const headers of [{ Origin: 'https://outside.example' }, { Host: 'outside.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    // Use raw HTTP: fetch can normalize/replace a caller-supplied Host header.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(`${baseUrl}/rpc/state`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } }, res => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(status, 403);
  }
  const oversized = await fetch(`${baseUrl}/rpc/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: { template: 'x'.repeat(3 * 1024 * 1024) } }) });
  assert.equal(oversized.status, 413);
});

test('missing records and private feed targets return safe typed errors', async () => {
  await assert.rejects(rpc.feeds.remove({ id: 'missing' }), error => typeof error === 'object' && error !== null && 'code' in error && error.code === 'NOT_FOUND');
  await assert.rejects(rpc.feeds.add({ url: 'http://127.0.0.1/private' }), error => typeof error === 'object' && error !== null && 'code' in error && error.code === 'BAD_REQUEST');
  assert.deepEqual((await rpc.state()).feeds, []);
});

test('provider RPC exposes catalog and connection state without credentials', async () => {
  const created = await rpc.providers.create({
    presetId: 'custom', name: 'RPC Gateway', protocol: 'anthropic-messages',
    baseUrl: 'https://gateway.example.com/v1', enabled: true, credential: 'RPC-SECRET', initialModelId: 'claude-rpc',
  });
  assert.equal(created.hasCredential, true);
  assert.equal(created.models[0]?.modelId, 'claude-rpc');
  assert.equal(JSON.stringify(created).includes('RPC-SECRET'), false);
  const listed = await rpc.providers.list();
  assert.ok(listed.catalog.some(preset => preset.id === 'openai'));
  assert.equal(JSON.stringify(listed).includes('RPC-SECRET'), false);
  await rpc.defaultModel.set({ providerModelId: created.models[0]!.id });
  await assert.rejects(rpc.providers.update({
    id: created.id, revision: created.revision, presetId: created.presetId, name: created.name,
    protocol: created.protocol, baseUrl: created.baseUrl, enabled: false, options: created.options,
  }), error => typeof error === 'object' && error !== null && 'code' in error && error.code === 'CONFLICT');
  await rpc.defaultModel.set({ providerModelId: null });
  await rpc.providers.remove({ id: created.id, revision: created.revision });
});
