import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { eq } from 'drizzle-orm';

process.env.DATABASE_PATH = ':memory:';
const { db, sqlite } = await import('@daily-signal/database');
const { feedIcons, feeds } = await import('@daily-signal/database/schema');
const { createFeedIconService } = await import('./icons');
after(() => sqlite.close());
beforeEach(() => {
  db.delete(feeds).run();
  db.delete(feedIcons).run();
});

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=',
  'base64',
);
const response = { body: png, contentType: 'image/png', status: 200, ok: true };
const expectedIcon = `data:image/png;base64,${png.toString('base64')}`;
const hour = 60 * 60 * 1000;

function addFeed(id: string, siteUrl = 'https://website.example.com/path') {
  db.insert(feeds)
    .values({
      id,
      siteUrl,
      url: `https://rss.example.com/${id}`,
      title: id,
      createdAt: '2026-09-28',
    })
    .run();
}

test('icons persist once per website and simultaneous requests share the download', async () => {
  addFeed('one');
  addFeed('two', 'https://website.example.com/another');
  let calls = 0;
  const service = createFeedIconService({
    fetchBytes: async (url, options) => {
      calls++;
      assert.equal(url, 'https://website.example.com/favicon.ico');
      assert.equal(options?.maxBytes, 512 * 1024);
      assert.equal(options?.timeoutMs, 5_000);
      return response;
    },
  });
  assert.deepEqual(await Promise.all([service.getIcon('one'), service.getIcon('two')]), [
    expectedIcon,
    expectedIcon,
  ]);
  assert.equal(calls, 1);
  assert.equal(db.select().from(feedIcons).all().length, 1);
  const offline = createFeedIconService({
    fetchBytes: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(await offline.getIcon('one'), expectedIcon);
  await assert.rejects(service.getIcon('missing'), { status: 404 });
});

test('expired icons refresh; failures keep the saved image and back off before retrying', async () => {
  addFeed('one');
  let clock = 0;
  let calls = 0;
  let fail = false;
  const service = createFeedIconService({
    now: () => clock,
    fetchBytes: async () => {
      calls++;
      if (fail) throw new Error('offline');
      return response;
    },
  });
  assert.equal(await service.getIcon('one'), expectedIcon);
  clock = 7 * 24 * hour;
  fail = true;
  assert.equal(await service.getIcon('one'), expectedIcon);
  assert.equal(await service.getIcon('one'), expectedIcon);
  assert.equal(calls, 2);
  assert.equal(db.select().from(feedIcons).get()?.nextFetchAt, clock + hour);
  clock += hour;
  fail = false;
  assert.equal(await service.getIcon('one'), expectedIcon);
  assert.equal(calls, 3);
  assert.equal(db.select().from(feedIcons).get()?.nextFetchAt, clock + 7 * 24 * hour);
});

test('missing, non-image and oversized responses are negatively cached then recover', async () => {
  addFeed('one');
  for (const invalid of [
    { ...response, ok: false, status: 404 },
    { ...response, body: Buffer.from('<html>Not an icon</html>') },
    { ...response, body: Buffer.alloc(0) },
    { ...response, body: Buffer.concat([png, Buffer.alloc(512 * 1024)]) },
  ]) {
    db.delete(feedIcons).run();
    let calls = 0;
    let clock = 0;
    const service = createFeedIconService({
      now: () => clock,
      fetchBytes: async () => {
        calls++;
        return calls === 1 ? invalid : response;
      },
    });
    assert.equal(await service.getIcon('one'), null);
    assert.equal(await service.getIcon('one'), null);
    assert.equal(calls, 1);
    clock += hour;
    assert.equal(await service.getIcon('one'), expectedIcon);
  }
});

test('website changes select a new cache entry, invalid websites fall back to the feed origin', async () => {
  addFeed('one');
  const requested: string[] = [];
  const service = createFeedIconService({
    fetchBytes: async (url) => {
      requested.push(url);
      return response;
    },
  });
  await service.getIcon('one');
  db.update(feeds).set({ siteUrl: 'https://other.example.com' }).where(eq(feeds.id, 'one')).run();
  await service.getIcon('one');
  for (const siteUrl of [
    '',
    'http://127.0.0.1',
    'https://user:secret@example.com',
    'javascript:alert(1)',
  ]) {
    db.update(feeds).set({ siteUrl }).where(eq(feeds.id, 'one')).run();
    await service.getIcon('one');
  }
  assert.deepEqual(requested, [
    'https://website.example.com/favicon.ico',
    'https://other.example.com/favicon.ico',
    'https://rss.example.com/favicon.ico',
  ]);
  db.update(feeds)
    .set({ siteUrl: 'http://127.0.0.1', url: 'http://10.0.0.1/feed' })
    .where(eq(feeds.id, 'one'))
    .run();
  assert.equal(await service.getIcon('one'), null);
  assert.equal(requested.length, 3);
});

test('SVG images remain image data and HTML or entity declarations are not cached', async () => {
  addFeed('one');
  for (const [svg, accepted] of [
    ['<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>', true],
    ['<html><script>alert(1)</script></html>', false],
    ['<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]><svg>&x;</svg>', false],
  ] as const) {
    db.delete(feedIcons).run();
    const service = createFeedIconService({
      fetchBytes: async () => ({
        ...response,
        contentType: 'image/svg+xml',
        body: Buffer.from(svg),
      }),
    });
    assert.equal(
      await service.getIcon('one'),
      accepted ? `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` : null,
    );
  }
});

test('large subscription lists keep icon downloads within eight slots', async () => {
  let active = 0;
  let peak = 0;
  const service = createFeedIconService({
    fetchBytes: async () => {
      peak = Math.max(peak, ++active);
      await new Promise<void>((resolve) => setImmediate(resolve));
      active--;
      return response;
    },
  });
  const ids = Array.from({ length: 20 }, (_, index) => `feed-${index}`);
  for (const id of ids) addFeed(id, `https://${id}.example.com`);
  assert.ok((await Promise.all(ids.map(service.getIcon))).every((icon) => icon === expectedIcon));
  assert.equal(peak, 8);
});
