import type { Settings } from '@daily-signal/domain';
import { HttpError } from '@daily-signal/domain/errors';
import { feedIngestion } from '@daily-signal/feeds/ingestion';
import { listFeeds } from '@daily-signal/feeds/repository';
import { getSettings } from '@daily-signal/settings';

export function createFeedRefreshScheduler(
  dependencies = {
    getSettings: (): Pick<Settings, 'feedRefresh'> => getSettings(),
    hasFeeds: () => listFeeds().length > 0,
    startRefresh: () => {
      feedIngestion.startRefresh();
    },
  },
) {
  let initialized = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let scheduledInterval: number | null = null;

  function run() {
    if (!dependencies.getSettings().feedRefresh.intervalMinutes || !dependencies.hasFeeds()) return;
    try {
      dependencies.startRefresh();
    } catch (error) {
      // Manual refresh and OPML import share the same ingestion lock. Skip this
      // tick while either is running; a later tick can retry without overlapping.
      if (!(error instanceof HttpError && error.status === 409))
        console.error('自动刷新订阅启动失败。');
    }
  }

  function refresh() {
    if (!initialized) return;
    const { intervalMinutes } = dependencies.getSettings().feedRefresh;
    if (intervalMinutes === scheduledInterval) return;
    if (timer) clearInterval(timer);
    timer = null;
    scheduledInterval = intervalMinutes;
    // Saving or starting the app only schedules the next run. It does not
    // immediately contact every subscription or replay missed intervals.
    if (intervalMinutes) {
      timer = setInterval(run, intervalMinutes * 60_000);
      timer.unref();
    }
  }

  return {
    initialize() {
      initialized = true;
      refresh();
    },
    refresh,
    stop() {
      initialized = false;
      if (timer) clearInterval(timer);
      timer = null;
      scheduledInterval = null;
    },
  };
}

export const feedRefreshScheduler = createFeedRefreshScheduler();
