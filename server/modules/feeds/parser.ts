import Parser from 'rss-parser';
import { XMLParser } from 'fast-xml-parser';
import type { Article } from '../../../shared/types';
import { HttpError } from '../../core/errors';

const rss = new Parser<object, { 'content:encoded'?: string }>({
  // rss-parser converts Atom timestamps without guarding invalid dates. Treat
  // them as missing before that conversion, so one bad entry cannot drop a feed.
  xml2js: {
    valueProcessors: [
      (value: string, name: string) =>
        (name === 'published' || name === 'updated') && !Number.isFinite(Date.parse(value))
          ? ''
          : value,
    ],
  },
});
const textParser = new XMLParser({ htmlEntities: true, parseTagValue: false, trimValues: false });
export const forbiddenXml = /<!\s*(?:DOCTYPE|ENTITY)\b/i;
export type ParsedArticle = Omit<Article, 'id' | 'feedId' | 'feedTitle'>;
type ParsedRss = Parser.Output<{ 'content:encoded'?: string }>;

function plainText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const stripped = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(?:p|div|br|li|h[1-6]|tr|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  // Decode HTML entities only after removing markup; encoded angle brackets
  // remain literal text, never a second markup parse.
  const result = textParser.parse(
    `<text>${stripped.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>`,
  ) as { text: string };
  return String(result.text ?? '')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
}

function articleUrl(value: unknown, base: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

export function categoryValue(value = ''): string {
  const category = value.trim();
  if (category.length > 200) throw new HttpError(400, '订阅分类不能超过 200 个字符。');
  return category;
}

export async function parseRss(xml: string): Promise<ParsedRss> {
  if (forbiddenXml.test(xml)) throw new HttpError(400, '订阅不允许包含 DTD 或自定义实体。');
  try {
    return await rss.parseString(xml);
  } catch {
    throw new HttpError(502, '服务器返回的内容不是有效的 RSS / Atom 订阅。');
  }
}

export function normalizeRss(parsed: ParsedRss, url: string, fetchedAt: string) {
  const siteUrl = articleUrl(parsed.link, url) ?? '';
  const items: ParsedArticle[] = [];
  for (const item of parsed.items) {
    const link = articleUrl(item.link, siteUrl || url);
    if (!link) continue;
    const timestamp = [item.isoDate, item.pubDate]
      .map((value) => (value ? Date.parse(value) : NaN))
      .find(Number.isFinite);
    items.push({
      title: plainText(item.title) || link,
      url: link,
      content: plainText(
        item['content:encoded'] || item.content || item.summary || item.contentSnippet,
      ).slice(0, 6_000),
      publishedAt: timestamp === undefined ? fetchedAt : new Date(timestamp).toISOString(),
      dateEstimated: timestamp === undefined,
    });
  }
  return { title: plainText(parsed.title) || new URL(url).hostname, siteUrl, fetchedAt, items };
}
