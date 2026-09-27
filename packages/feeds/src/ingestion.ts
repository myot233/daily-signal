import { randomUUID } from 'node:crypto';
import type { Feed, FeedRefreshStatus } from '@daily-signal/domain';
import { HttpError } from '@daily-signal/domain/errors';
import { listFeeds } from './repository';
import { importOpml, refreshFeeds } from './service';

// One coordinator owns both import and refresh. A reload can reconnect to its
// lightweight status without keeping a minutes-long HTTP request open.
export function createFeedIngestion(dependencies = { listFeeds, importOpml, refreshFeeds }) {
  let status: FeedRefreshStatus | null = null;
  let importing = false;
  const snapshot = () => (status ? { ...status, errors: [...status.errors] } : null);

  function assertIdle() {
    if (importing || status?.status === 'running')
      throw new HttpError(409, '订阅正在后台抓取，请等待完成。');
  }

  function start(selected: Feed[]): FeedRefreshStatus {
    const job: FeedRefreshStatus = {
      id: randomUUID(),
      status: selected.length ? 'running' : 'completed',
      total: selected.length,
      completed: 0,
      added: 0,
      errors: [],
      startedAt: new Date().toISOString(),
      finishedAt: selected.length ? null : new Date().toISOString(),
      message: null,
    };
    status = job;
    if (selected.length)
      setImmediate(() => {
        void dependencies
          .refreshFeeds(selected, (completed, result) => {
            job.completed = completed;
            job.added = result.added;
            job.errors = [...result.errors];
          })
          .then(
            (result) => {
              job.status = 'completed';
              job.completed = job.total;
              job.added = result.added;
              job.errors = [...result.errors];
              job.finishedAt = new Date().toISOString();
            },
            () => {
              job.status = 'failed';
              job.message = '后台抓取中断，已保存的订阅和文章仍保留，可重新刷新。';
              job.finishedAt = new Date().toISOString();
            },
          );
      });
    return snapshot()!;
  }

  return {
    getStatus: snapshot,
    startRefresh() {
      assertIdle();
      return start(dependencies.listFeeds());
    },
    async import(xml: string) {
      assertIdle();
      importing = true;
      try {
        const result = await dependencies.importOpml(xml);
        if (result.imported)
          start(dependencies.listFeeds().filter((feed) => !feed.lastFetchedAt && !feed.error));
        return result;
      } finally {
        importing = false;
      }
    },
  };
}

export const feedIngestion = createFeedIngestion();
