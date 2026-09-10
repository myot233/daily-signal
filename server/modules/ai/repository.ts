import { desc, eq } from 'drizzle-orm';
import type { Digest } from '../../../shared/types';
import { HttpError } from '../../core/errors';
import { db } from '../../infrastructure/database/client';
import { digests } from '../../infrastructure/database/schema';

export function listDigests(): Digest[] {
  return db.select().from(digests).orderBy(desc(digests.createdAt)).all();
}

export function saveDigest(digest: Digest): void {
  db.insert(digests).values(digest).run();
}

export function removeDigest(id: string): void {
  const result = db.delete(digests).where(eq(digests.id, id)).run();
  if (!result.changes) throw new HttpError(404, '日报不存在。');
}
