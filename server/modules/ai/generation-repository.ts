import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import {
  digestGenerationEventSchema,
  type DigestGenerationEvent,
  type DigestGenerationEventData,
  type DigestGenerationProgress,
  type DigestGenerationStatus,
} from '../../../shared/types';
import { HttpError } from '../../core/errors';
import { db, sqlite } from '../../infrastructure/database/client';
import {
  digestGenerationEvents,
  digestGenerationSessions,
} from '../../infrastructure/database/schema';

const activeStatuses = ['running'] satisfies DigestGenerationStatus[];

function insertEvent(sessionId: string, event: DigestGenerationEventData, createdAt: string): void {
  db.insert(digestGenerationEvents).values({ sessionId, event, createdAt }).run();
}

export function createDigestGenerationSession(): string {
  return sqlite.transaction(() => {
    const active = db
      .select({ id: digestGenerationSessions.id })
      .from(digestGenerationSessions)
      .where(inArray(digestGenerationSessions.status, activeStatuses))
      .get();
    if (active) throw new HttpError(409, '日报正在生成，请等待完成。');

    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(digestGenerationSessions)
      .values({ id, status: 'running', createdAt: now, updatedAt: now })
      .run();
    insertEvent(id, { type: 'queued' }, now);
    return id;
  })();
}

export function appendDigestGenerationProgress(
  sessionId: string,
  event: DigestGenerationProgress,
): void {
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const session = db
      .select({ status: digestGenerationSessions.status })
      .from(digestGenerationSessions)
      .where(eq(digestGenerationSessions.id, sessionId))
      .get();
    if (!session || session.status !== 'running') return;
    insertEvent(sessionId, event, now);
    db.update(digestGenerationSessions)
      .set({ updatedAt: now })
      .where(eq(digestGenerationSessions.id, sessionId))
      .run();
  })();
}

export function completeDigestGenerationSession(sessionId: string, digestId: string): void {
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    insertEvent(sessionId, { type: 'completed', digestId }, now);
    db.update(digestGenerationSessions)
      .set({ status: 'completed', updatedAt: now })
      .where(eq(digestGenerationSessions.id, sessionId))
      .run();
  })();
}

export function failDigestGenerationSession(sessionId: string, message: string): void {
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    insertEvent(sessionId, { type: 'failed', message }, now);
    db.update(digestGenerationSessions)
      .set({ status: 'failed', updatedAt: now })
      .where(eq(digestGenerationSessions.id, sessionId))
      .run();
  })();
}

export function listDigestGenerationEvents(
  sessionId: string,
  afterEventId = 0,
): DigestGenerationEvent[] {
  return db
    .select()
    .from(digestGenerationEvents)
    .where(
      and(
        eq(digestGenerationEvents.sessionId, sessionId),
        gt(digestGenerationEvents.id, afterEventId),
      ),
    )
    .orderBy(asc(digestGenerationEvents.id))
    .all()
    .map((row) =>
      digestGenerationEventSchema.parse({
        ...row.event,
        id: row.id,
        sessionId: row.sessionId,
        createdAt: row.createdAt,
      }),
    );
}

export function getDigestGenerationSession(sessionId: string) {
  return db
    .select()
    .from(digestGenerationSessions)
    .where(eq(digestGenerationSessions.id, sessionId))
    .get();
}

export function getActiveDigestGenerationSessionId(): string | null {
  return (
    db
      .select({ id: digestGenerationSessions.id })
      .from(digestGenerationSessions)
      .where(inArray(digestGenerationSessions.status, activeStatuses))
      .orderBy(desc(digestGenerationSessions.updatedAt))
      .get()?.id ?? null
  );
}

export function failInterruptedDigestGenerationSessions(): void {
  const sessions = db
    .select({ id: digestGenerationSessions.id })
    .from(digestGenerationSessions)
    .where(inArray(digestGenerationSessions.status, activeStatuses))
    .all();
  for (const session of sessions) {
    failDigestGenerationSession(
      session.id,
      '本地服务在生成期间停止，任务未完成，也未保存新的日报。',
    );
  }
}
