import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { eq } from 'drizzle-orm';
import { HttpError } from '../../core/errors';
import { PublicFetchError } from '../../infrastructure/network/public-fetch';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

// Dynamic imports guarantee no application database is opened before isolation.
process.env.DATABASE_PATH = ':memory:';
const { db, sqlite } = await import('../../infrastructure/database/client');
const { listArticles, listFeeds } = await import('./repository');
const { articles, feeds } = await import('../../infrastructure/database/schema');
const { createFeedService, exportOpml } = await import('./service');
after(() => sqlite.close());
beforeEach(() => {
  db.delete(feeds).run();
});

const feedUrl = 'https://news.example.com/rss';
function rssFixture(date = '', extra = '') {
  return `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
    <title>技术 &amp; 开源</title><link>https://news.example.com/</link><description>技术</description>
    <item><title><![CDATA[<b>版本发布</b>]]></title><link>/release#one</link><pubDate>Thu, 10 Sep 2026 01:00:00 GMT</pubDate><description>摘要</description><content:encoded><![CDATA[<p>完整 &amp; 正文</p>]]></content:encoded></item>
    <item><title>第二篇</title><link>/second</link><pubDate>2026-09-10T02:00:00Z</pubDate></item>
    <item><title>无日期</title><link>/undated</link>${date ? `<pubDate>${date}</pubDate>` : ''}<description>首次发现</description></item>${extra}
  </channel></rss>`;
}
const atomFixture = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom 技术</title><id>https://atom.example.com/</id><updated>2026-09-10T01:00:00Z</updated><link href="https://atom.example.com/"/>
  <entry><id>one</id><title>第一篇</title><link href="https://atom.example.com/one"/><updated>2026-09-10T01:00:00Z</updated><content type="html">&lt;p&gt;第一篇正文&lt;/p&gt;</content></entry>
  <entry><id>two</id><title>第二篇</title><link href="https://atom.example.com/two"/><published>2026-09-10T02:00:00Z</published></entry>
  <entry><id>three</id><title>缺失日期</title><link href="https://atom.example.com/three"/></entry></feed>`;

function opml(body: string) {
  return `<opml version="2.0"><body>${body}</body></opml>`;
}
function outline(url: string) {
  return `<outline type="rss" xmlUrl="${url}"/>`;
}

test('RSS and Atom ingestion is idempotent; missing dates stay stable and can gain real dates', async () => {
  let clock = new Date('2026-09-10T12:00:00Z');
  let xml = rssFixture();
  const service = createFeedService({
    now: () => clock,
    fetchText: async (url) => ({
      text: url.includes('atom.') ? atomFixture : xml,
      status: 200,
      ok: true,
    }),
  });
  const rssFeed = await service.addFeed(`${feedUrl}#ignored`, '技术');
  await service.addFeed('https://atom.example.com/feed');
  assert.equal(rssFeed.url, feedUrl);
  assert.equal(rssFeed.articleCount, 3);
  assert.equal(listArticles().length, 6);
  const release = listArticles().find((article) => article.url.endsWith('/release'))!;
  assert.equal(release.title, '版本发布');
  assert.equal(release.content, '完整 & 正文');
  const estimated = listArticles().filter((article) => article.dateEstimated);
  assert.equal(estimated.length, 2);
  clock = new Date('2026-09-11T12:00:00Z');
  assert.deepEqual(await service.refreshFeeds(), { added: 0, errors: [] });
  assert.deepEqual(
    listArticles()
      .filter((article) => article.dateEstimated)
      .map((article) => [article.id, article.publishedAt]),
    estimated.map((article) => [article.id, article.publishedAt]),
  );
  xml = rssFixture('2026-09-09T08:00:00Z');
  await service.refreshFeeds();
  const dated = listArticles().find((article) => article.url.endsWith('/undated'))!;
  assert.equal(dated.publishedAt, '2026-09-09T08:00:00.000Z');
  assert.equal(dated.dateEstimated, false);
  xml = rssFixture();
  await service.refreshFeeds();
  assert.equal(
    listArticles().find((article) => article.id === dated.id)?.publishedAt,
    dated.publishedAt,
  );
  assert.equal(listArticles().length, 6);
});

test('unsafe/missing article URLs are skipped; query strings distinguish articles and content is bounded', async () => {
  const extra = `<item><link>javascript:alert(1)</link></item><item><title>无链接</title></item><item><link>https://user:password@news.example.com/secret</link></item><item><link>/release?edition=2#fragment</link><description>${'字'.repeat(7_000)}</description></item>`;
  const service = createFeedService({
    fetchText: async () => ({ text: rssFixture('', extra), status: 200, ok: true }),
  });
  await service.addFeed(feedUrl);
  const result = listArticles();
  assert.equal(result.length, 4);
  assert.equal(result.find((article) => article.url.endsWith('?edition=2'))?.content.length, 6_000);
});

test('concurrent duplicate additions yield one source; invalid feeds never create rows', async () => {
  const service = createFeedService({
    fetchText: async () => ({ text: rssFixture(), status: 200, ok: true }),
  });
  const results = await Promise.allSettled([
    service.addFeed(feedUrl),
    service.addFeed(`${feedUrl}#duplicate`),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const failure = results.find((result) => result.status === 'rejected');
  assert.ok(
    failure?.status === 'rejected' &&
      failure.reason instanceof HttpError &&
      failure.reason.status === 409,
  );
  assert.equal(listFeeds().length, 1);
  assert.equal(listArticles().length, 3);
  const invalid = createFeedService({
    fetchText: async () => ({ text: '<html>not a feed</html>', status: 200, ok: true }),
  });
  await assert.rejects(invalid.addFeed('https://invalid.example.com/feed'), { status: 502 });
  await assert.rejects(service.addFeed('http://127.0.0.1/rss'), { status: 400 });
  await assert.rejects(service.addFeed('https://other.example.com/rss', 'x'.repeat(201)), {
    status: 400,
  });
  assert.equal(listFeeds().length, 1);
});

test('failed refresh preserves articles and last success; successful retry clears error', async () => {
  let fail = false;
  const service = createFeedService({
    fetchText: async () => {
      if (fail) throw new Error('secret-raw-upstream-message');
      return { text: rssFixture(), status: 200, ok: true };
    },
  });
  const source = await service.addFeed(feedUrl);
  const previous = listArticles();
  fail = true;
  const result = await service.refreshFeeds();
  assert.equal(result.errors.length, 1);
  assert.ok(!result.errors[0]!.error.includes('secret-raw-upstream-message'));
  assert.deepEqual(listArticles(), previous);
  assert.equal(listFeeds()[0]?.lastFetchedAt, source.lastFetchedAt);
  assert.equal(listFeeds()[0]?.error, result.errors[0]!.error);
  fail = false;
  await service.refreshFeeds();
  assert.equal(listFeeds()[0]?.error, null);
});

test('deleting a source while refresh is in flight never resurrects it or its articles', async () => {
  const started = deferred();
  const release = deferred();
  let hold = false;
  const service = createFeedService({
    fetchText: async () => {
      if (hold) {
        started.resolve();
        await release.promise;
      }
      return { text: rssFixture(), status: 200, ok: true };
    },
  });
  const source = await service.addFeed(feedUrl);
  hold = true;
  const refresh = service.refreshFeeds();
  await started.promise;
  db.delete(feeds).where(eq(feeds.id, source.id)).run();
  release.resolve();
  assert.deepEqual(await refresh, { added: 0, errors: [] });
  assert.deepEqual(listFeeds(), []);
  assert.deepEqual(db.select().from(articles).all(), []);
});

test('nested OPML preserves Chinese categories and escaped URLs through export/import; partial failures persist successes', async () => {
  const service = createFeedService({
    fetchText: async (url) => {
      if (url.includes('failed.')) throw new PublicFetchError('网络请求失败。');
      return { text: rssFixture(), status: 200, ok: true };
    },
  });
  const input = opml(
    `<outline text="技术 &amp; AI"><outline title="中文">${outline('https://one.example.com/rss?a=1&amp;b=2')}${outline('https://two.example.com/rss')}${outline('https://one.example.com/rss?a=1&amp;b=2')}${outline('https://failed.example.com/rss')}</outline></outline>`,
  );
  const result = await service.importOpml(input);
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(
    result.errors.map((error) => error.url),
    ['https://failed.example.com/rss'],
  );
  const expected = listFeeds()
    .map((feed) => [feed.url, feed.category])
    .sort();
  assert.ok(expected.every(([, category]) => category === '技术 & AI / 中文'));
  const exported = exportOpml();
  db.delete(feeds).run();
  assert.deepEqual(await service.importOpml(exported), { imported: 2, skipped: 0, errors: [] });
  assert.deepEqual(
    listFeeds()
      .map((feed) => [feed.url, feed.category])
      .sort(),
    expected,
  );
  assert.deepEqual(await service.importOpml(exported), { imported: 0, skipped: 2, errors: [] });
});

test('OPML rejects DTD, invalid structure, bytes, count and depth before any network work', async () => {
  let calls = 0;
  const service = createFeedService({
    fetchText: async () => {
      calls++;
      return { text: rssFixture(), status: 200, ok: true };
    },
  });
  const cases: [string, number][] = [
    ['<!DOCTYPE opml [<!ENTITY x SYSTEM "file:///secret">]>' + opml(outline(feedUrl)), 400],
    ['<opml><body><outline></body></opml>', 400],
    [opml('<unexpected/>'), 400],
    [opml('字'.repeat(700_000)), 413],
    [
      opml(
        Array.from({ length: 201 }, (_, i) => outline(`https://news.example.com/${i}`)).join(''),
      ),
      413,
    ],
    [opml('<outline text="x">'.repeat(21) + outline(feedUrl) + '</outline>'.repeat(21)), 413],
  ];
  for (const [input, status] of cases) await assert.rejects(service.importOpml(input), { status });
  assert.equal(calls, 0);
  assert.deepEqual(listFeeds(), []);
  assert.deepEqual(
    await service.importOpml(
      opml('<outline text="x">'.repeat(20) + outline(feedUrl) + '</outline>'.repeat(20)),
    ),
    { imported: 1, skipped: 0, errors: [] },
  );
});

test('DTD feed is rejected without inserting a source', async () => {
  const service = createFeedService({
    fetchText: async () => ({
      text: '<!DOCTYPE rss [<!ENTITY x "bad">]>' + rssFixture(),
      status: 200,
      ok: true,
    }),
  });
  await assert.rejects(service.addFeed(feedUrl), { status: 400 });
  assert.deepEqual(listFeeds(), []);
});

test('OPML import and refresh bound simultaneous source work to four', async () => {
  let active = 0;
  let peak = 0;
  const service = createFeedService({
    fetchText: async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return { text: rssFixture(), status: 200, ok: true };
    },
  });
  const result = await service.importOpml(
    opml(Array.from({ length: 9 }, (_, i) => outline(`https://news.example.com/${i}`)).join('')),
  );
  assert.equal(result.imported, 9);
  assert.equal(peak, 4);
  peak = 0;
  assert.deepEqual(await service.refreshFeeds(), { added: 0, errors: [] });
  assert.equal(peak, 4);
});

test('invalid RSS and Atom dates become estimated instead of dropping the source', async () => {
  const discoveredAt = '2026-09-10T12:00:00.000Z';
  const service = createFeedService({
    now: () => new Date(discoveredAt),
    fetchText: async (url) => ({
      text: url.includes('atom.')
        ? atomFixture.replace('<id>three</id>', '<id>three</id><published>not-a-date</published>')
        : rssFixture('not-a-date'),
      status: 200,
      ok: true,
    }),
  });
  await service.addFeed(feedUrl);
  await service.addFeed('https://atom.example.com/feed');
  const estimated = listArticles().filter((article) => article.dateEstimated);
  assert.equal(estimated.length, 2);
  assert.ok(estimated.every((article) => article.publishedAt === discoveredAt));
  assert.equal(listArticles().length, 6);
});

test('OPML roundtrip preserves stored category segments including empty intermediate labels', async () => {
  const service = createFeedService({
    fetchText: async () => ({ text: rssFixture(), status: 200, ok: true }),
  });
  const category = '技术 /  / AI & 开源';
  await service.addFeed(feedUrl, category);
  const exported = exportOpml();
  db.delete(feeds).run();
  await service.importOpml(exported);
  assert.equal(listFeeds()[0]?.category, category);
});
