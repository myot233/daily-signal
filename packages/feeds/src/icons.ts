import { eq } from 'drizzle-orm';
import { XMLValidator } from 'fast-xml-parser';
import { db } from '@daily-signal/database';
import { feedIcons, feeds } from '@daily-signal/database/schema';
import { HttpError } from '@daily-signal/domain/errors';
import { fetchPublicBytes, normalizePublicUrl } from '@daily-signal/network';

const maxBytes = 512 * 1024;
const freshFor = 7 * 24 * 60 * 60 * 1000;
const retryAfter = 60 * 60 * 1000;

function iconUrl(siteUrl: string, feedUrl: string): string | null {
  for (const value of [siteUrl, feedUrl]) {
    try {
      return new URL('/favicon.ico', normalizePublicUrl(value)).href;
    } catch {
      // Older feeds may have an empty or invalid website URL.
    }
  }
  return null;
}

function imageType(body: Buffer, contentType: string): string | null {
  if (body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return 'image/png';
  if (body.length > 6 && body.readUInt32LE(0) === 0x00010000 && body.readUInt16LE(4) > 0)
    return 'image/x-icon';
  if (body.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))) return 'image/jpeg';
  if (/^GIF8[79]a$/.test(body.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  if (contentType.split(';')[0]?.trim().toLowerCase() === 'image/svg+xml') {
    const svg = body.toString('utf8').trim();
    if (
      /^(?:<\?xml\s[^?]*\?>\s*)?<svg[\s>]/.test(svg) &&
      !/<!DOCTYPE|<!ENTITY/i.test(svg) &&
      XMLValidator.validate(svg) === true
    )
      return 'image/svg+xml';
  }
  return null;
}

export function createFeedIconService(
  dependencies: { fetchBytes?: typeof fetchPublicBytes; now?: () => number } = {},
) {
  const fetchBytes = dependencies.fetchBytes ?? fetchPublicBytes;
  const now = dependencies.now ?? Date.now;
  const pending = new Map<string, Promise<string | null>>();
  const waiting: (() => void)[] = [];
  let active = 0;

  async function load(url: string, previous: string | null): Promise<string | null> {
    if (active >= 8) await new Promise<void>((resolve) => waiting.push(resolve));
    else active++;
    let dataUrl = previous;
    let nextFetchAt: number;
    try {
      const response = await fetchBytes(url, { timeoutMs: 5_000, maxBytes });
      const type = imageType(response.body, response.contentType);
      if (!response.ok || !type || response.body.length > maxBytes)
        throw new Error('Icon unavailable');
      // Render only as an image data URL, never as same-origin HTML or an SVG document.
      dataUrl = `data:${type};base64,${response.body.toString('base64')}`;
      nextFetchAt = now() + freshFor;
    } catch {
      // A failed refresh must not replace a usable icon with an empty cache entry.
      nextFetchAt = now() + retryAfter;
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
    db.insert(feedIcons)
      .values({ url, dataUrl, nextFetchAt })
      .onConflictDoUpdate({ target: feedIcons.url, set: { dataUrl, nextFetchAt } })
      .run();
    return dataUrl;
  }

  async function getIcon(id: string): Promise<string | null> {
    const feed = db.select().from(feeds).where(eq(feeds.id, id)).get();
    if (!feed) throw new HttpError(404, '订阅源不存在。');
    const url = iconUrl(feed.siteUrl, feed.url);
    if (!url) return null;
    const cached = db.select().from(feedIcons).where(eq(feedIcons.url, url)).get();
    if (cached && cached.nextFetchAt > now()) return cached.dataUrl;
    const existing = pending.get(url);
    if (existing) return existing;
    const request = load(url, cached?.dataUrl ?? null).finally(() => pending.delete(url));
    pending.set(url, request);
    return request;
  }

  return { getIcon };
}

export const feedIconService = createFeedIconService();
