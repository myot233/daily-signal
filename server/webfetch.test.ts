import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockAgent } from 'undici';
import type { Article } from '../shared/types';
import { createPageReader, MAX_FETCH_PAGES, MAX_PAGE_CHARACTERS } from './webfetch';
import { createPublicFetcher, PublicFetchError } from './network';

function source(index = 0): Article {
  return { id: String(index), feedId: 'feed', feedTitle: 'Engineering', title: `Article ${index}`, url: `https://example.com/${index}`, content: 'RSS summary', publishedAt: '2026-09-10T00:00:00.000Z', dateEstimated: false };
}

test('webfetch extracts readable HTML, records the final URL, and caches concurrent duplicates', async () => {
  const article = source();
  let calls = 0;
  const reader = createPageReader([article], new AbortController().signal, async (url, options) => {
    calls++;
    assert.equal(url, article.url);
    assert.equal(options?.headers?.Authorization, undefined);
    assert.equal(options?.body, undefined);
    assert.equal(options?.maxBytes, 1_000_000);
    return { text: '<html><head><title>Noise</title></head><body><nav>Navigation</nav><article><h1>Release notes</h1><p>A &amp; B use &lt;T&gt;.</p><script>secret()</script><style>.hidden{}</style><img src="https://elsewhere.example/tracker"><p>Migration details.</p></article><footer>Footer</footer></body></html>', contentType: 'text/html', url: 'https://example.com/final', status: 200, ok: true };
  });
  const results = await Promise.all([reader.read(article.url), reader.read(`${article.url}#details`)]);
  assert.equal(calls, 1);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0]?.status, 'success');
  if (results[0]?.status !== 'success') assert.fail('Expected readable page');
  assert.match(results[0].content, /Release notes[\s\S]*A & B use <T>\.[\s\S]*Migration details/);
  assert.doesNotMatch(results[0].content, /secret|hidden|Navigation|Footer|tracker|Noise/);
  assert.equal(results[0].url, 'https://example.com/final');
  assert.deepEqual(article.webFetch, results[0]);
  assert.equal(article.content, 'RSS summary');
});

test('plain text stays literal, long pages are marked as excerpts, and empty HTML fails safely', async () => {
  const articles = [source(), source(1)];
  const reader = createPageReader(articles, new AbortController().signal, async url => ({
    text: url === articles[0]!.url ? '<T>& literal ' + 'x'.repeat(MAX_PAGE_CHARACTERS) : '<script>no text</script>',
    contentType: url === articles[0]!.url ? 'text/plain' : 'text/html', status: 200, ok: true,
  }));
  const result = await reader.read(articles[0]!.url);
  assert.equal(result.status, 'success');
  if (result.status !== 'success') assert.fail('Expected text');
  assert.match(result.content, /^<T>& literal/);
  assert.equal(result.content.length, MAX_PAGE_CHARACTERS);
  assert.equal(result.truncated, true);
  assert.equal((await reader.read(articles[1]!.url)).status, 'error');
});

test('only original source URLs are allowed, and parallel calls cannot exceed the shared page budget', async () => {
  const articles = Array.from({ length: MAX_FETCH_PAGES + 2 }, (_, i) => source(i));
  let calls = 0, active = 0, peak = 0;
  const reader = createPageReader(articles, new AbortController().signal, async () => {
    calls++; active++; peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return { text: 'A page', contentType: 'text/plain', status: 200, ok: true };
  });
  for (const url of ['http://127.0.0.1/secret', 'file:///etc/passwd', 'https://unknown.example/page', `${articles[0]!.url}?extra=secret`]) {
    assert.equal((await reader.read(url)).status, 'error');
  }
  assert.equal(calls, 0);
  const results = await Promise.all(articles.map(article => reader.read(article.url)));
  assert.equal(calls, MAX_FETCH_PAGES);
  assert.equal(peak, 1);
  assert.equal(reader.remaining, 0);
  assert.equal(results.filter(result => result.status === 'success').length, MAX_FETCH_PAGES);
  assert.equal(results.filter(result => result.status === 'error').length, 2);
});

test('failed reads are cached and raw transport errors are never exposed', async () => {
  const article = source();
  let calls = 0;
  const reader = createPageReader([article], new AbortController().signal, async () => { calls++; throw new Error('PRIVATE-TRANSPORT-DETAIL'); });
  const result = await reader.read(article.url);
  assert.equal(result.status, 'error');
  assert.equal(JSON.stringify(result).includes('PRIVATE-TRANSPORT-DETAIL'), false);
  assert.deepEqual(await reader.read(article.url), result);
  assert.equal(calls, 1);
  assert.deepEqual(article.webFetch, result);
});

test('cancellation stops queued reads and never writes a successful snapshot', async () => {
  const controller = new AbortController();
  const articles = [source(), source(1)];
  let calls = 0;
  const reader = createPageReader(articles, controller.signal, async (_url, options) => {
    calls++;
    assert.equal(options?.signal, controller.signal);
    controller.abort();
    throw new PublicFetchError('cancelled', 'cancelled');
  });
  const results = await Promise.allSettled(articles.map(article => reader.read(article.url)));
  assert.ok(results.every(result => result.status === 'rejected'));
  assert.equal(calls, 1);
  assert.ok(articles.every(article => article.webFetch === undefined));
});

test('real fetch path rejects private redirects and nontext or oversized responses', async () => {
  const agent = new MockAgent();
  agent.disableNetConnect();
  const pool = agent.get('https://example.com');
  pool.intercept({ path: '/0' }).reply(302, '', { headers: { location: 'http://127.0.0.1/secret' } });
  pool.intercept({ path: '/1' }).reply(200, '%PDF', { headers: { 'content-type': 'application/pdf' } });
  pool.intercept({ path: '/2' }).reply(200, 'huge', { headers: { 'content-type': 'text/html', 'content-length': '1000001' } });
  pool.intercept({ path: '/3' }).reply(404, 'missing');
  pool.intercept({ path: '/4' }).reply(200, '<p>Readable text</p>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const articles = Array.from({ length: 5 }, (_, i) => source(i));
  const reader = createPageReader(articles, new AbortController().signal, createPublicFetcher(agent));
  try {
    for (const article of articles.slice(0, 4)) assert.equal((await reader.read(article.url)).status, 'error');
    assert.equal((await reader.read(articles[4]!.url)).status, 'success');
    agent.assertNoPendingInterceptors();
  } finally { await agent.close(); }
});
