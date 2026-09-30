import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type { Settings } from '@daily-signal/domain';

process.env.DATABASE_PATH = ':memory:';
const { sqlite } = await import('@daily-signal/database');
const { createFeedRefreshScheduler } = await import('./feed-refresh-scheduler');
const { createFeedIngestion } = await import('@daily-signal/feeds/ingestion');
after(() => sqlite.close());
const minute = 60_000;

test('refresh settings take effect on the next cycle; unchanged saves keep cadence and disabling stops work', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let intervalMinutes: Settings['feedRefresh']['intervalMinutes'] = 0;
  let runs = 0;
  let hasFeeds = true;
  const scheduler = createFeedRefreshScheduler({
    getSettings: () => ({ feedRefresh: { intervalMinutes } }),
    hasFeeds: () => hasFeeds,
    startRefresh: () => {
      runs++;
    },
  });
  t.after(() => scheduler.stop());
  scheduler.initialize();
  t.mock.timers.tick(60 * minute);
  assert.equal(runs, 0);
  intervalMinutes = 15;
  scheduler.refresh();
  assert.equal(runs, 0);
  t.mock.timers.tick(10 * minute);
  scheduler.refresh();
  t.mock.timers.tick(5 * minute);
  assert.equal(runs, 1);
  intervalMinutes = 30;
  scheduler.refresh();
  t.mock.timers.tick(15 * minute);
  assert.equal(runs, 1);
  t.mock.timers.tick(15 * minute);
  assert.equal(runs, 2);
  hasFeeds = false;
  t.mock.timers.tick(30 * minute);
  assert.equal(runs, 2);
  hasFeeds = true;
  intervalMinutes = 0;
  scheduler.refresh();
  t.mock.timers.tick(60 * minute);
  assert.equal(runs, 2);
  intervalMinutes = 15;
  scheduler.refresh();
  scheduler.stop();
  t.mock.timers.tick(60 * minute);
  assert.equal(runs, 2);
});

test('automatic refresh shares manual refresh and import locks, then retries on a later cycle', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const feed = {
    id: 'scheduled-feed',
    url: 'https://news.example.com/feed',
    title: 'News',
    category: '',
    siteUrl: '',
    createdAt: '2026-09-27T00:00:00.000Z',
    lastFetchedAt: null,
    error: null,
    articleCount: 0,
  };
  let releaseRefresh!: () => void;
  let releaseImport!: () => void;
  let requests = 0;
  const job = createFeedIngestion({
    listFeeds: () => [feed],
    refreshFeeds: async () => {
      requests++;
      await new Promise<void>((resolve) => {
        releaseRefresh = resolve;
      });
      return { added: 1, errors: [] };
    },
    importOpml: async () => {
      await new Promise<void>((resolve) => {
        releaseImport = resolve;
      });
      return { imported: 0, skipped: 0, errors: [] };
    },
  });
  const scheduler = createFeedRefreshScheduler({
    getSettings: () => ({ feedRefresh: { intervalMinutes: 15 } }),
    hasFeeds: () => true,
    startRefresh: () => {
      job.startRefresh();
    },
  });
  t.after(() => scheduler.stop());
  scheduler.initialize();
  const manual = job.startRefresh();
  await nextTurn();
  t.mock.timers.tick(15 * minute);
  assert.equal(job.getStatus()?.id, manual.id);
  assert.equal(requests, 1);
  releaseRefresh();
  await nextTurn();
  assert.equal(job.getStatus()?.status, 'completed');
  const importing = job.import('<opml/>');
  t.mock.timers.tick(15 * minute);
  assert.equal(job.getStatus()?.id, manual.id);
  releaseImport();
  await importing;
  t.mock.timers.tick(15 * minute);
  await nextTurn();
  assert.notEqual(job.getStatus()?.id, manual.id);
  assert.equal(requests, 2);
  releaseRefresh();
  await nextTurn();
  assert.equal(job.getStatus()?.status, 'completed');
});
