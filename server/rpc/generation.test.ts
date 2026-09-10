import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { ContractRouterClient } from '@orpc/contract';
import type { contract } from '../../shared/contract';
import type { DigestGenerationEvent } from '../../shared/types';
// Test-only loading boundary: select isolated storage before importing database-backed modules.

process.env.DATABASE_PATH = ':memory:';
const { createApp } = await import('../http/app');
const {
  appendDigestGenerationProgress,
  completeDigestGenerationSession,
  createDigestGenerationSession,
  listDigestGenerationEvents,
} = await import('../modules/ai/generation-repository');

const server = createServer(createApp());
let rpc: ContractRouterClient<typeof contract>;

before(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  rpc = createORPCClient(new RPCLink({ url: `${baseUrl}/rpc` }));
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('generate returns a session and oRPC replays persisted progress after an SSE reconnect', async () => {
  const state = await rpc.state();
  const started = await rpc.digests.generate({
    date: '2026-09-10',
    startAt: '2026-09-10T00:00:00.000Z',
    endAt: '2026-09-11T00:00:00.000Z',
    providerModelId: state.defaultProviderModelId!,
  });
  assert.match(started.sessionId, /^[0-9a-f-]{36}$/);

  const failedEvents: DigestGenerationEvent[] = [];
  const failedStream = await rpc.digests.subscribe({ sessionId: started.sessionId });
  for await (const event of failedStream) failedEvents.push(event);
  assert.deepEqual(
    failedEvents.map((event) => event.type),
    ['queued', 'failed'],
  );
  const failure = failedEvents.at(-1);
  assert.equal(failure?.type, 'failed');
  if (failure?.type !== 'failed') assert.fail('Expected a terminal failure event.');
  assert.match(failure.message, /API Key/);
  assert.equal((await rpc.state()).activeDigestGenerationSessionId, null);

  const sessionId = createDigestGenerationSession();
  const queued = listDigestGenerationEvents(sessionId)[0]!;
  setImmediate(() => {
    appendDigestGenerationProgress(sessionId, {
      type: 'preparing',
      articleCount: 12,
      batchCount: 3,
    });
    appendDigestGenerationProgress(sessionId, { type: 'extracting', current: 2, total: 3 });
    completeDigestGenerationSession(sessionId, 'digest-id');
  });

  const replayed: DigestGenerationEvent[] = [];
  const stream = await rpc.digests.subscribe({ sessionId, afterEventId: queued.id });
  for await (const event of stream) replayed.push(event);
  assert.deepEqual(
    replayed.map((event) => event.type),
    ['preparing', 'extracting', 'completed'],
  );
  assert.ok(replayed.every((event) => event.id > queued.id));
  assert.equal((await rpc.state()).activeDigestGenerationSessionId, null);
});
