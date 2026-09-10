import { setTimeout as delay } from 'node:timers/promises';
import type {
  DigestGenerationEvent,
  DigestGenerationProgress,
  DigestGenerationSubscription,
  DigestInput,
} from '../../../shared/types';
import { HttpError } from '../../core/errors';
import {
  appendDigestGenerationProgress,
  completeDigestGenerationSession,
  createDigestGenerationSession,
  failDigestGenerationSession,
  failInterruptedDigestGenerationSessions,
  getDigestGenerationSession,
  listDigestGenerationEvents,
} from './generation-repository';
import { generateDigest } from './service';

let activeController: AbortController | null = null;
let activeTask: Promise<void> | null = null;

function safeGenerationError(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  console.error('Background digest generation failed with an unexpected internal error.');
  return '服务器内部错误，日报未生成。';
}

async function runDigestGeneration(
  sessionId: string,
  input: DigestInput,
  signal: AbortSignal,
): Promise<void> {
  try {
    const digest = await generateDigest(input, {
      signal,
      onProgress: (event: DigestGenerationProgress) =>
        appendDigestGenerationProgress(sessionId, event),
    });
    completeDigestGenerationSession(sessionId, digest.id);
  } catch (error) {
    failDigestGenerationSession(sessionId, safeGenerationError(error));
  }
}

export function startDigestGeneration(input: DigestInput): { sessionId: string } {
  const sessionId = createDigestGenerationSession();
  const controller = new AbortController();
  activeController = controller;
  const task = new Promise<void>((resolve) => {
    setImmediate(() => {
      void runDigestGeneration(sessionId, input, controller.signal).finally(resolve);
    });
  });
  activeTask = task;
  void task.then(() => {
    if (activeTask === task) {
      activeTask = null;
      activeController = null;
    }
  });
  return { sessionId };
}

export function ensureDigestGenerationSession(sessionId: string): void {
  if (!getDigestGenerationSession(sessionId)) throw new HttpError(404, '生成会话不存在。');
}

export async function* subscribeDigestGeneration(
  input: DigestGenerationSubscription,
  signal?: AbortSignal,
): AsyncGenerator<DigestGenerationEvent, void, void> {
  let afterEventId = input.afterEventId ?? 0;
  while (!signal?.aborted) {
    const events = listDigestGenerationEvents(input.sessionId, afterEventId);
    if (events.length) {
      for (const event of events) {
        afterEventId = event.id;
        yield event;
        if (event.type === 'completed' || event.type === 'failed') return;
      }
      continue;
    }

    const session = getDigestGenerationSession(input.sessionId);
    if (!session) throw new HttpError(404, '生成会话不存在。');
    if (session.status !== 'running') {
      // The terminal event and status are committed together. Re-read once so a
      // commit between the event and status queries cannot close the stream early.
      if (listDigestGenerationEvents(input.sessionId, afterEventId).length) continue;
      return;
    }

    try {
      await delay(200, undefined, signal ? { signal } : undefined);
    } catch {
      if (signal?.aborted) return;
      throw new HttpError(500, '读取生成进度失败。');
    }
  }
}

export function initializeDigestGenerationQueue(): void {
  failInterruptedDigestGenerationSessions();
}

export async function stopDigestGenerationQueue(): Promise<void> {
  activeController?.abort();
  await activeTask;
}
