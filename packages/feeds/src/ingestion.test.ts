import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';

process.env.DATABASE_PATH = ':memory:';
const { db, sqlite } = await import('@daily-signal/database');
const { feeds } = await import('@daily-signal/database/schema');
const { listFeeds, listArticles } = await import('./repository');
const { createFeedService } = await import('./service');
const { createFeedIngestion } = await import('./ingestion');
after(() => sqlite.close());
beforeEach(() => {
  db.delete(feeds).run();
});

const xml =
  '<opml><body><outline title="中文标题" xmlUrl="https://news.example.com/feed"/><outline xmlUrl="https://failed.example.com/feed"/></body></opml>';
const rss =
  '<rss version="2.0"><channel><title>News</title><link>https://news.example.com</link><description>test</description><item><title>Article</title><link>https://news.example.com/article</link></item></channel></rss>';
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function finish(job: ReturnType<typeof createFeedIngestion>) {
  for (let turn = 0; turn < 20 && job.getStatus()?.status === 'running'; turn++) await nextTurn();
  assert.notEqual(job.getStatus()?.status, 'running');
}

test('import acknowledges persisted subscriptions before fetching; progress and failures survive client reconnect', async () => {
  const began = deferred();
  const release = deferred();
  let requests = 0;
  const service = createFeedService({
    fetchText: async (url) => {
      requests++;
      began.resolve();
      await release.promise;
      if (url.includes('failed.')) throw new Error('private upstream details');
      return { text: rss, status: 200, ok: true };
    },
  });
  const job = createFeedIngestion({ ...service, listFeeds });
  assert.deepEqual(await job.import(xml), { imported: 2, skipped: 0, errors: [] });
  assert.equal(requests, 0);
  assert.equal(listFeeds().length, 2);
  assert.equal(listArticles().length, 0);
  const initial = job.getStatus()!;
  assert.equal(initial.status, 'running');
  assert.equal(initial.total, 2);
  await began.promise;
  assert.throws(() => job.startRefresh(), { status: 409 });
  await assert.rejects(job.import(xml), { status: 409 });
  release.resolve();
  await finish(job);
  const final = job.getStatus()!;
  assert.equal(final.id, initial.id);
  assert.equal(final.status, 'completed');
  assert.equal(final.completed, 2);
  assert.equal(final.added, 1);
  assert.equal(final.errors.length, 1);
  assert.ok(!JSON.stringify(final).includes('private upstream details'));
  assert.equal(listFeeds().length, 2);
  assert.equal(listArticles().length, 1);
  assert.equal(initial.completed, 0);
  final.errors.length = 0;
  assert.equal(job.getStatus()!.errors.length, 1);
  assert.deepEqual(await job.import(xml), { imported: 0, skipped: 2, errors: [] });
  assert.equal(requests, 2);
});

test('invalid import releases its lock; interrupted acquisition preserves subscriptions and permits retry', async () => {
  const service = createFeedService({
    fetchText: async () => ({ text: rss, status: 200, ok: true }),
  });
  let fail = true;
  const job = createFeedIngestion({
    ...service,
    listFeeds,
    refreshFeeds: async (...args) => {
      if (fail) throw new Error('private failure');
      return service.refreshFeeds(...args);
    },
  });
  await assert.rejects(job.import('<broken>'), { status: 400 });
  await job.import(xml);
  await finish(job);
  assert.equal(job.getStatus()?.status, 'failed');
  assert.equal(listFeeds().length, 2);
  assert.ok(!JSON.stringify(job.getStatus()).includes('private failure'));
  fail = false;
  assert.equal(job.startRefresh().status, 'running');
  await finish(job);
  assert.equal(job.getStatus()?.status, 'completed');
  assert.equal(listArticles().length, 2);
});

test('empty refresh completes immediately without network work', () => {
  const job = createFeedIngestion({ listFeeds, ...createFeedService() });
  assert.equal(job.startRefresh().status, 'completed');
  assert.equal(job.getStatus()?.total, 0);
});
