import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import type { LookupAddress } from 'node:dns';
import { test } from 'node:test';
import { Agent, MockAgent } from 'undici';
import { createPublicFetcher, createPublicLookup, normalizePublicUrl, PublicFetchError } from './network';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// Only the test-created dispatcher routes the public-looking fixture host to a
// local server. Production's fixed secure dispatcher cannot access this seam.
async function localFixture(listener: RequestListener) {
  const server = createServer(listener);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const agent = new Agent({ connect: { lookup: (_hostname, options, callback) => {
    if (options.all) callback(null, [{ address: '127.0.0.1', family: 4 }]);
    else callback(null, '127.0.0.1', 4);
  } } });
  return {
    url: `http://fixture.example.com:${address.port}/`, fetchText: createPublicFetcher(agent),
    async close() { await agent.destroy(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); },
  };
}

test('URL normalization rejects private/reserved destinations, credentials and non-HTTP protocols', () => {
  const blocked = [
    'http://127.0.0.1/', 'http://0x7f000001/', 'http://10.1.2.3/', 'http://172.16.0.1/', 'http://192.168.1.1/',
    'http://169.254.169.254/', 'http://100.64.0.1/', 'http://0.0.0.0/', 'http://192.0.2.1/', 'http://224.0.0.1/',
    'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[fc00::1]/', 'http://[fe80::1]/', 'http://[2001:db8::1]/',
    'http://localhost/', 'http://secret.internal/', 'file:///etc/passwd', 'https://user:secret@example.com/',
  ];
  for (const url of blocked) assert.throws(() => normalizePublicUrl(url), PublicFetchError, url);
  assert.equal(normalizePublicUrl(' HTTPS://Example.COM./feed?a=1#part '), 'https://example.com/feed?a=1');
  assert.equal(normalizePublicUrl('https://[2606:4700:4700::1111]/'), 'https://[2606:4700:4700::1111]/');
});

test('actual connector lookup rejects mixed public/private DNS answers and never returns the private record', async () => {
  const answers: LookupAddress[] = [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.4', family: 4 }];
  const lookup = createPublicLookup((_hostname, callback) => callback(null, answers));
  await new Promise<void>(resolve => lookup('fixture.example.com', { all: true }, (error, addresses) => {
    assert.ok(error instanceof PublicFetchError);
    assert.equal(addresses, '');
    resolve();
  }));
  const agent = new Agent({ connect: { lookup, timeout: 100 } });
  try {
    await assert.rejects(createPublicFetcher(agent)('http://fixture.example.com/'), error =>
      error instanceof PublicFetchError && error.message.includes('私有网络'));
  } finally { await agent.destroy(); }
});

test('lookup honors requested families and hands the validated records directly to connector', async () => {
  const answers: LookupAddress[] = [{ address: '93.184.216.34', family: 4 }, { address: '2606:4700:4700::1111', family: 6 }];
  const lookup = createPublicLookup((_hostname, callback) => callback(null, answers));
  await new Promise<void>(resolve => lookup('fixture.example.com', { family: 6, all: true }, (error, addresses) => {
    assert.equal(error, null);
    assert.deepEqual(addresses, [answers[1]]);
    resolve();
  }));
  const privateV6 = createPublicLookup((_hostname, callback) => callback(null, [{ address: '::ffff:192.168.1.1', family: 6 }]));
  await new Promise<void>(resolve => privateV6('fixture.example.com', {}, error => { assert.ok(error instanceof PublicFetchError); resolve(); }));
});

test('GET redirects revalidate destinations; POST redirects never dispatch a second request', async () => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const pool = agent.get('https://fixture.example.com');
  pool.intercept({ path: '/private' }).reply(302, '', { headers: { location: 'http://127.0.0.1/secret' } });
  pool.intercept({ path: '/post', method: 'POST' }).reply(302, '', { headers: { location: '/key-leak' } });
  let leaked = false;
  pool.intercept({ path: '/key-leak', method: 'POST' }).reply(() => { leaked = true; return { statusCode: 200, data: 'unexpected' }; });
  const fetchText = createPublicFetcher(agent);
  try {
    await assert.rejects(fetchText('https://fixture.example.com/private'), error => error instanceof PublicFetchError && error.message.includes('私有网络'));
    await assert.rejects(fetchText('https://fixture.example.com/post', { method: 'POST', body: '{}', headers: { authorization: 'Bearer sentinel-key' } }), error => error instanceof PublicFetchError && error.message.includes('重定向'));
    assert.equal(leaked, false);
  } finally { await agent.close(); }
});

test('GET follows four redirects but rejects the fifth', async () => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const pool = agent.get('https://fixture.example.com');
  for (let index = 0; index < 4; index++) pool.intercept({ path: `/ok${index}` }).reply(302, '', { headers: { location: `/ok${index + 1}` } });
  pool.intercept({ path: '/ok4' }).reply(200, 'last');
  for (let index = 0; index < 5; index++) pool.intercept({ path: `/loop${index}` }).reply(302, '', { headers: { location: `/loop${index + 1}` } });
  try {
    assert.deepEqual(await createPublicFetcher(agent)('https://fixture.example.com/ok0'), { text: 'last', status: 200, ok: true });
    await assert.rejects(createPublicFetcher(agent)('https://fixture.example.com/loop0'), error => error instanceof PublicFetchError && error.message.includes('重定向'));
  } finally { await agent.close(); }
});

test('cross-origin GET redirects remove credentials', async () => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  agent.get('https://fixture.example.com').intercept({ path: '/' }).reply(302, '', { headers: { location: 'https://other.example.com/' } });
  let received: Record<string, string> = {};
  agent.get('https://other.example.com').intercept({ path: '/', headers: headers => { received = headers; return true; } }).reply(200, 'safe');
  try {
    await createPublicFetcher(agent)('https://fixture.example.com/', { headers: {
      authorization: 'Bearer sentinel-key', cookie: 'session=sentinel-key',
      'x-api-key': 'anthropic-sentinel', 'x-goog-api-key': 'gemini-sentinel', 'x-custom-token': 'custom-sentinel',
    } });
    assert.equal(received.authorization, undefined);
    assert.equal(received.cookie, undefined);
    assert.equal(received['x-api-key'], undefined);
    assert.equal(received['x-goog-api-key'], undefined);
    assert.equal(received['x-custom-token'], undefined);
  } finally { await agent.close(); }
});

test('credentialed GET callers can forbid redirects before a second origin is contacted', async () => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  agent.get('https://fixture.example.com').intercept({ path: '/models' }).reply(302, '', { headers: { location: 'https://other.example.com/models' } });
  let contacted = false;
  agent.get('https://other.example.com').intercept({ path: '/models' }).reply(() => { contacted = true; return { statusCode: 200, data: '{}' }; });
  try {
    await assert.rejects(createPublicFetcher(agent)('https://fixture.example.com/models', {
      headers: { 'x-goog-api-key': 'gemini-sentinel' }, redirect: 'error',
    }), error => error instanceof PublicFetchError && error.message.includes('不允许服务器重定向'));
    assert.equal(contacted, false);
  } finally { await agent.close(); }
});

test('oversized content-length is refused and chunked oversize stops response consumption', async () => {
  for (const declared of [true, false]) {
    const closed = deferred();
    const fixture = await localFixture((_request, response) => {
      response.writeHead(200, declared ? { 'content-length': '100000' } : {});
      response.write('x'.repeat(1_024));
      response.on('close', () => closed.resolve());
    });
    try {
      await assert.rejects(fixture.fetchText(fixture.url, { maxBytes: 100, timeoutMs: 2_000 }), error => error instanceof PublicFetchError && error.kind === 'oversize');
      await closed.promise;
    } finally { await fixture.close(); }
  }
});

test('timeout interrupts a stalled response body and closes the connection', async () => {
  const closed = deferred();
  const fixture = await localFixture((_request, response) => {
    response.writeHead(200);
    response.write('partial');
    response.on('close', () => closed.resolve());
  });
  try {
    await assert.rejects(fixture.fetchText(fixture.url, { timeoutMs: 100 }), error => error instanceof PublicFetchError && error.kind === 'timeout');
    await closed.promise;
  } finally { await fixture.close(); }
});

test('external cancellation interrupts body consumption without exposing the abort reason', async () => {
  const started = deferred();
  const closed = deferred();
  const fixture = await localFixture((_request, response) => {
    response.writeHead(200);
    response.write('partial');
    started.resolve();
    response.on('close', () => closed.resolve());
  });
  const controller = new AbortController();
  try {
    const request = fixture.fetchText(fixture.url, { signal: controller.signal, timeoutMs: 5_000 });
    await started.promise;
    controller.abort(new Error('sentinel-secret-in-abort-reason'));
    await assert.rejects(request, error => error instanceof PublicFetchError && error.kind === 'cancelled' && !error.message.includes('sentinel'));
    await closed.promise;
  } finally { await fixture.close(); }
});

test('already cancelled calls do not dispatch a request; HTTP failures return status without leaking body errors', async () => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  let requested = false;
  agent.get('https://fixture.example.com').intercept({ path: '/' }).reply(() => { requested = true; return { statusCode: 401, data: 'upstream response' }; });
  const fetchText = createPublicFetcher(agent);
  try {
    await assert.rejects(fetchText('https://fixture.example.com/', { signal: AbortSignal.abort('secret') }), error => error instanceof PublicFetchError && error.kind === 'cancelled');
    assert.equal(requested, false);
    assert.deepEqual(await fetchText('https://fixture.example.com/'), { text: 'upstream response', status: 401, ok: false });
    agent.get('https://fixture.example.com').intercept({ path: '/error' }).replyWithError(new Error('sentinel-secret-raw-error'));
    await assert.rejects(fetchText('https://fixture.example.com/error'), error => error instanceof PublicFetchError && !error.message.includes('sentinel'));
  } finally { await agent.close(); }
});
