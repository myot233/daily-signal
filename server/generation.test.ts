import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { implement } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import { contract } from '../shared/contract';
import type { Digest, DigestInput } from '../shared/types';
import type { GenerationProgress } from '../shared/progress';
import { HttpError } from './errors';

process.env.DATABASE_PATH = ':memory:';
const { createGenerationService } = await import('./generation');
const input: DigestInput = { date: '2026-09-10', startAt: '2026-09-10T00:00:00.000Z', endAt: '2026-09-11T00:00:00.000Z', apiKey: 'SECRET-MUST-NOT-STREAM' };
const progress: GenerationProgress = { id: 'prepare', kind: 'stage', status: 'running', at: input.startAt, message: '正在读取资料' };
const digest: Digest = { id: 'digest', date: input.date, title: 'Daily report', markdown: 'Report', articleCount: 0, createdAt: input.endAt, model: 'mock', sources: [], workflow: [{ ...progress, status: 'success' }] };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test('stream emits progress before completion, shares the generation lock, and emits a terminal result', async () => {
  const gate = deferred();
  let completed = false;
  const service = createGenerationService(async (_input, options) => {
    options?.onProgress?.(progress);
    await gate.promise;
    completed = true;
    return digest;
  });
  const stream = service.stream(input);
  assert.deepEqual((await stream.next()).value, { type: 'progress', progress });
  assert.equal(completed, false);
  await assert.rejects(service.generate(input), error => error instanceof HttpError && error.status === 409);
  gate.resolve();
  assert.deepEqual((await stream.next()).value, { type: 'complete', digest });
  assert.equal((await stream.next()).done, true);
  assert.deepEqual(await service.generate(input), digest);
});

test('stream returns safe failure events and releases its lock', async () => {
  for (const error of [new Error(input.apiKey), new HttpError(502, '模型服务暂不可用。')]) {
    let calls = 0;
    const service = createGenerationService(async (_input, options) => {
      if (++calls > 1) return digest;
      options?.onProgress?.(progress);
      throw error;
    });
    const events = [];
    for await (const event of service.stream(input)) events.push(event);
    assert.equal(events[0]?.type, 'progress');
    assert.equal(events[1]?.type, 'failed');
    assert.equal(JSON.stringify(events).includes(input.apiKey), false);
    assert.deepEqual(await service.generate(input), digest);
  }
});

test('closing the iterator aborts model work and releases the lock', async () => {
  let aborted = false;
  const service = createGenerationService(async (_input, options) => {
    options?.onProgress?.(progress);
    await new Promise<void>(resolve => options?.signal?.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
    throw new HttpError(504, '已取消');
  });
  const stream = service.stream(input);
  await stream.next();
  await stream.return(undefined);
  assert.equal(aborted, true);
  const next = service.stream(input);
  assert.equal((await next.next()).value?.type, 'progress');
  await next.return(undefined);
});

test('request cancellation interrupts a pending pull instead of hanging', async () => {
  const controller = new AbortController();
  const service = createGenerationService(async (_input, options) => {
    options?.onProgress?.(progress);
    await new Promise<void>(resolve => options?.signal?.addEventListener('abort', () => resolve(), { once: true }));
    throw new HttpError(504, '已取消');
  });
  const stream = service.stream(input, controller.signal);
  await stream.next();
  const pending = stream.next();
  controller.abort();
  await assert.rejects(pending);
});

const gate = deferred();
let rpc: ContractRouterClient<typeof contract>;
const service = createGenerationService(async (_input, options) => {
  options?.onProgress?.(progress);
  await gate.promise;
  return digest;
});
const implementer = implement(contract);
const handler = new RPCHandler({ digests: { generateStream: implementer.digests.generateStream.handler(({ input }) => service.stream(input)) } });
const server = createServer(async (request, response) => {
  await handler.handle(request, response, { prefix: '/rpc' });
});
before(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/rpc`;
  rpc = createORPCClient(new RPCLink({ url, method: 'POST' }));
});
after(async () => { gate.resolve(); await new Promise<void>(resolve => server.close(() => resolve())); });

test('typed oRPC client receives progress over HTTP before the digest exists', async () => {
  const events = await rpc.digests.generateStream(input);
  const first = await events.next();
  assert.deepEqual(first.value, { type: 'progress', progress });
  gate.resolve();
  assert.deepEqual((await events.next()).value, { type: 'complete', digest });
  assert.equal((await events.next()).done, true);
});
