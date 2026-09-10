import { Cron } from 'croner';
import { digestInputSchema } from '../../../shared/types';
import { HttpError } from '../../core/errors';
import { getApiKey, getDefaultProviderModelId, getSettings } from '../settings/repository';
import { startDigestGeneration } from './generation-queue';
import { hasDigestForDate } from './repository';

let job: Cron | null = null;
let initialized = false;

function localDigestInput(now: Date, providerModelId: string) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const start = new Date(year, month, day);
  const end = new Date(year, month, day + 1);
  const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return digestInputSchema.parse({
    date,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    providerModelId,
  });
}

export function runScheduledDailyDigest(now = new Date()): { sessionId: string } | null {
  try {
    const providerModelId = getDefaultProviderModelId();
    if (!providerModelId || !getApiKey()) {
      console.warn('自动日报已跳过：请先配置带 API Key 的默认模型。');
      return null;
    }

    const input = localDigestInput(now, providerModelId);
    if (hasDigestForDate(input.date)) {
      console.info(`自动日报已跳过：${input.date} 已有归档。`);
      return null;
    }

    const session = startDigestGeneration(input);
    console.info(`自动日报已开始：${input.date}。`);
    return session;
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) {
      console.info('自动日报已跳过：另一份日报正在生成。');
      return null;
    }
    console.error('自动日报启动失败。');
    return null;
  }
}

function applySchedule(): Cron | null {
  job?.stop();
  job = null;

  const { autoDigest } = getSettings();
  if (!autoDigest.enabled) return null;

  const [hour, minute] = autoDigest.time.split(':').map(Number);
  job = new Cron(
    `${minute} ${hour} * * *`,
    {
      mode: '5-part',
      protect: true,
      unref: true,
      catch: () => console.error('自动日报任务执行失败。'),
    },
    () => {
      runScheduledDailyDigest();
    },
  );
  console.info(`自动日报已启用：每天本地时间 ${autoDigest.time}。`);
  return job;
}

export function initializeDailyDigestScheduler(): Cron | null {
  initialized = true;
  return applySchedule();
}

export function refreshDailyDigestSchedule(): void {
  if (initialized) applySchedule();
}

export function stopDailyDigestScheduler(): void {
  initialized = false;
  job?.stop();
  job = null;
}
