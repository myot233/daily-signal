import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { contract } from '../shared/contract';

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

test('runtime contract rejects untyped secret fields, malformed input and unknown procedures', async () => {
  const state = await rpc.state();
  const secret = 'NO-SECRET-IN-ERROR-OR-STORAGE';
  const invalid = await fetch(`${baseUrl}/rpc/settings/save`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ json: { ...state.settings, apiKey: secret } }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.text()).includes(secret), false);
  assert.equal(JSON.stringify(await rpc.state()).includes(secret), false);
  const malformed = await fetch(`${baseUrl}/rpc/settings/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  const missing = await fetch(`${baseUrl}/rpc/not-a-procedure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(missing.status, 404);
});

test('saving a malformed template returns a useful error and preserves settings', async () => {
  const initial = await rpc.state();
  await assert.rejects(rpc.settings.save({ ...initial.settings, template: '{% if articleCount > 0 %}' }), error => {
    assert.ok(error instanceof Error && 'code' in error);
    assert.equal(error.code, 'BAD_REQUEST');
    assert.match(error.message, /模板错误/);
    return true;
  });
  assert.deepEqual((await rpc.state()).settings, initial.settings);
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

test('generation endpoint streams preparation and a safe empty-day failure', async () => {
  const events = await rpc.digests.generateStream({ date: '2026-09-10', startAt: '2026-09-10T00:00:00.000Z', endAt: '2026-09-11T00:00:00.000Z', apiKey: 'NEVER-STREAM-KEY' });
  const received = [];
  for await (const event of events) received.push(event);
  assert.equal(received[0]?.type, 'progress');
  assert.equal(received.at(-1)?.type, 'failed');
  assert.match(JSON.stringify(received), /没有可总结的文章/);
  assert.equal(JSON.stringify(received).includes('NEVER-STREAM-KEY'), false);
  // Both generation routes share and release the same lock on failure.
  await assert.rejects(rpc.digests.generate({ date: '2026-09-10', startAt: '2026-09-10T00:00:00.000Z', endAt: '2026-09-11T00:00:00.000Z', apiKey: 'KEY' }), error => error instanceof Error && 'code' in error && error.code === 'BAD_REQUEST');
});
