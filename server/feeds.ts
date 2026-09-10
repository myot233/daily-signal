import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import Parser from 'rss-parser';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Feed, ImportResult, RefreshResult } from '../shared/types';
import { db, listFeeds } from './db';
import { articles, feeds } from './schema';
import { HttpError } from './errors';
import { fetchPublicText, normalizePublicUrl, PublicFetchError } from './network';

const rss = new Parser<object, { 'content:encoded'?: string }>({
  // rss-parser converts Atom timestamps without guarding invalid dates. Treat
  // them as missing before that conversion, so one bad entry cannot drop a feed.
  xml2js: { valueProcessors: [(value: string, name: string) =>
    (name === 'published' || name === 'updated') && !Number.isFinite(Date.parse(value)) ? '' : value] },
});
const textParser = new XMLParser({ htmlEntities: true, parseTagValue: false, trimValues: false });
const opmlParser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, trimValues: false });
const forbiddenXml = /<!\s*(?:DOCTYPE|ENTITY)\b/i;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ParsedArticle = Omit<typeof articles.$inferInsert, 'id' | 'feedId'>;
type XmlNode = { [name: string]: XmlNode[] | Record<string, string> | string };

function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const stripped = value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(?:p|div|br|li|h[1-6]|tr|blockquote)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '');
  // Decode HTML entities only after removing markup; encoded angle brackets
  // remain literal text, never a second markup parse.
  const result = textParser.parse(`<text>${stripped.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`) as { text: string };
  return String(result.text ?? '').replace(/[\t ]+/g, ' ').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

function articleUrl(value: unknown, base: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

function sourceError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof PublicFetchError) {
    return new HttpError(error.kind === 'timeout' ? 504 : error.kind === 'oversize' ? 413 : 502, error.message);
  }
  return new HttpError(502, '无法获取或解析订阅，请检查订阅地址并稍后重试。');
}

function normalizedUrl(value: string): string {
  try { return normalizePublicUrl(value); }
  catch { throw new HttpError(400, '请输入有效的公开 HTTP(S) 订阅地址，不允许本机、私网或凭据。'); }
}

function categoryValue(value = ''): string {
  const category = value.trim();
  if (category.length > 200) throw new HttpError(400, '订阅分类不能超过 200 个字符。');
  return category;
}

async function concurrent<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!);
  }));
}

function ingest(tx: Transaction, feedId: string, incoming: ParsedArticle[]): number {
  const previous = new Map(tx.select().from(articles).where(eq(articles.feedId, feedId)).all().map(article => [article.url, article]));
  let added = 0;
  for (const item of incoming) {
    const existing = previous.get(item.url);
    if (existing) {
      const updated = { ...existing, title: item.title, content: item.content,
        ...(item.dateEstimated ? {} : { publishedAt: item.publishedAt, dateEstimated: false }) };
      tx.update(articles).set(updated).where(eq(articles.id, existing.id)).run();
      previous.set(item.url, updated);
    } else {
      const row = { ...item, id: randomUUID(), feedId, dateEstimated: item.dateEstimated ?? false };
      tx.insert(articles).values(row).run();
      previous.set(item.url, row);
      added++;
    }
  }
  return added;
}

// Only ingestion's fetch and clock are injectable. Production callers use the
// exports below, and cannot disable public-network validation with user input.
export function createFeedService(dependencies: { fetchText?: typeof fetchPublicText; now?: () => Date } = {}) {
  const fetchText = dependencies.fetchText ?? fetchPublicText;
  const now = dependencies.now ?? (() => new Date());

  async function load(url: string) {
    const response = await fetchText(url, { timeoutMs: 20_000, maxBytes: 3 * 1024 * 1024 });
    if (!response.ok) throw new HttpError(502, `订阅服务器返回 HTTP ${response.status}，请稍后重试。`);
    if (forbiddenXml.test(response.text)) throw new HttpError(400, '订阅不允许包含 DTD 或自定义实体。');
    let parsed: Parser.Output<{ 'content:encoded'?: string }>;
    try { parsed = await rss.parseString(response.text); }
    catch { throw new HttpError(502, '服务器返回的内容不是有效的 RSS / Atom 订阅。'); }
    const fetchedAt = now().toISOString();
    const siteUrl = articleUrl(parsed.link, url) ?? '';
    const items: ParsedArticle[] = [];
    for (const item of parsed.items) {
      const link = articleUrl(item.link, siteUrl || url);
      if (!link) continue;
      const timestamp = [item.isoDate, item.pubDate].map(value => value ? Date.parse(value) : NaN).find(Number.isFinite);
      items.push({ title: plainText(item.title) || link, url: link,
        content: plainText(item['content:encoded'] || item.content || item.summary || item.contentSnippet).slice(0, 6_000),
        publishedAt: timestamp === undefined ? fetchedAt : new Date(timestamp).toISOString(), dateEstimated: timestamp === undefined });
    }
    return { title: plainText(parsed.title) || new URL(url).hostname, siteUrl, fetchedAt, items };
  }

  async function addFeed(value: string, category?: string): Promise<Feed> {
    const url = normalizedUrl(value);
    const normalizedCategory = categoryValue(category);
    if (db.select({ id: feeds.id }).from(feeds).where(eq(feeds.url, url)).get()) throw new HttpError(409, '这个订阅源已经添加。');
    try {
      const loaded = await load(url);
      return db.transaction(tx => {
        if (tx.select({ id: feeds.id }).from(feeds).where(eq(feeds.url, url)).get()) throw new HttpError(409, '这个订阅源已经添加。');
        const row = { id: randomUUID(), url, title: loaded.title, category: normalizedCategory,
          siteUrl: loaded.siteUrl, createdAt: loaded.fetchedAt, lastFetchedAt: loaded.fetchedAt, error: null };
        tx.insert(feeds).values(row).run();
        const articleCount = ingest(tx, row.id, loaded.items);
        return { ...row, articleCount };
      });
    } catch (error) { throw sourceError(error); }
  }

  async function refreshFeeds(): Promise<RefreshResult> {
    const result: RefreshResult = { added: 0, errors: [] };
    await concurrent(listFeeds(), async feed => {
      try {
        const loaded = await load(feed.url);
        result.added += db.transaction(tx => {
          if (!tx.select({ id: feeds.id }).from(feeds).where(eq(feeds.id, feed.id)).get()) return 0;
          const added = ingest(tx, feed.id, loaded.items);
          tx.update(feeds).set({ title: loaded.title, siteUrl: loaded.siteUrl, lastFetchedAt: loaded.fetchedAt, error: null }).where(eq(feeds.id, feed.id)).run();
          return added;
        });
      } catch (error) {
        const message = sourceError(error).message;
        const updated = db.update(feeds).set({ error: message }).where(eq(feeds.id, feed.id)).run();
        if (updated.changes) result.errors.push({ url: feed.url, error: message });
      }
    });
    return result;
  }

  async function importOpml(xml: string): Promise<ImportResult> {
    const candidates = parseOpml(xml);
    const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
    const seen = new Set(listFeeds().map(feed => feed.url));
    const pending: { url: string; category: string }[] = [];
    for (const candidate of candidates) {
      let url: string;
      try { url = normalizedUrl(candidate.url); }
      catch (error) { result.errors.push({ url: candidate.url, error: sourceError(error).message }); continue; }
      if (seen.has(url)) { result.skipped++; continue; }
      seen.add(url);
      pending.push({ ...candidate, url });
    }
    await concurrent(pending, async candidate => {
      try { await addFeed(candidate.url, candidate.category); result.imported++; }
      catch (error) {
        if (error instanceof HttpError && error.status === 409) result.skipped++;
        else result.errors.push({ url: candidate.url, error: sourceError(error).message });
      }
    });
    return result;
  }

  return { addFeed, refreshFeeds, importOpml, exportOpml };
}

function parseOpml(xml: string): { url: string; category: string }[] {
  if (Buffer.byteLength(xml, 'utf8') > 2 * 1024 * 1024) throw new HttpError(413, 'OPML 文件不能超过 2 MiB。');
  if (forbiddenXml.test(xml)) throw new HttpError(400, 'OPML 不允许包含 DTD 或自定义实体。');
  if (XMLValidator.validate(xml) !== true) throw new HttpError(400, 'OPML 文件不是有效的 XML。');
  const document = opmlParser.parse(xml) as XmlNode[];
  const roots = document.filter(node => !Object.keys(node).some(key => key.startsWith('?') || key.startsWith('#')));
  const root = roots[0]?.opml;
  if (roots.length !== 1 || !Array.isArray(root)) throw new HttpError(400, '请选择有效的 OPML 文件。');
  const bodies = root.filter(node => 'body' in node);
  const body = bodies[0]?.body;
  if (bodies.length !== 1 || !Array.isArray(body)) throw new HttpError(400, 'OPML 必须包含一个 body。');
  const candidates: { url: string; category: string }[] = [];
  function walk(nodes: XmlNode[], path: string[], depth: number) {
    for (const node of nodes) {
      if ('#text' in node && !String(node['#text']).trim()) continue;
      if (!Array.isArray(node.outline)) throw new HttpError(400, 'OPML body 只能包含 outline。');
      const attributes = node[':@'] as Record<string, string> | undefined;
      const url = attributes?.['@_xmlUrl'];
      if (url !== undefined) {
        if (!url.trim()) throw new HttpError(400, 'OPML 订阅地址不能为空。');
        candidates.push({ url, category: categoryValue(path.join(' / ')) });
        if (candidates.length > 200) throw new HttpError(413, '一次最多导入 200 个订阅源。');
        if (node.outline.length) walk(node.outline, path, depth);
      } else {
        if (depth >= 20) throw new HttpError(413, 'OPML 分类层级不能超过 20 层。');
        const folder = attributes?.['@_title'] ?? attributes?.['@_text'];
        const nested = folder === undefined ? path : [...path, folder];
        categoryValue(nested.join(' / '));
        walk(node.outline, nested, depth + 1);
      }
    }
  }
  walk(body, [], 0);
  return candidates;
}

function xmlEscape(value: string): string {
  return value.replace(/\p{Cc}/gu, character => {
    const code = character.charCodeAt(0);
    return code > 31 || character === '\t' || character === '\n' || character === '\r' ? character : '';
  })
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function exportOpml(): string {
  type Folder = { folders: Map<string, Folder>; feeds: Feed[] };
  const root: Folder = { folders: new Map(), feeds: [] };
  for (const feed of listFeeds()) {
    let folder = root;
    for (const segment of feed.category ? feed.category.split(' / ') : []) {
      let child = folder.folders.get(segment);
      if (!child) { child = { folders: new Map(), feeds: [] }; folder.folders.set(segment, child); }
      folder = child;
    }
    folder.feeds.push(feed);
  }
  function render(folder: Folder): string {
    return [...folder.folders].map(([name, child]) => `<outline text="${xmlEscape(name)}" title="${xmlEscape(name)}">${render(child)}</outline>`).join('')
      + folder.feeds.map(feed => `<outline type="rss" text="${xmlEscape(feed.title)}" title="${xmlEscape(feed.title)}" xmlUrl="${xmlEscape(feed.url)}" htmlUrl="${xmlEscape(feed.siteUrl)}"/>`).join('');
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>Daily Signal 订阅</title></head><body>${render(root)}</body></opml>\n`;
}

const service = createFeedService();
export const addFeed = service.addFeed;
export const refreshFeeds = service.refreshFeeds;
export const importOpml = service.importOpml;
