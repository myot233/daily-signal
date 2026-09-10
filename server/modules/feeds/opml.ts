import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Feed } from '../../../shared/types';
import { HttpError } from '../../core/errors';
import { categoryValue, forbiddenXml } from './parser';

const opmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
});
type XmlNode = { [name: string]: XmlNode[] | Record<string, string> | string };

export function parseOpml(xml: string): { url: string; category: string }[] {
  if (Buffer.byteLength(xml, 'utf8') > 2 * 1024 * 1024)
    throw new HttpError(413, 'OPML 文件不能超过 2 MiB。');
  if (forbiddenXml.test(xml)) throw new HttpError(400, 'OPML 不允许包含 DTD 或自定义实体。');
  if (XMLValidator.validate(xml) !== true) throw new HttpError(400, 'OPML 文件不是有效的 XML。');
  const document = opmlParser.parse(xml) as XmlNode[];
  const roots = document.filter(
    (node) => !Object.keys(node).some((key) => key.startsWith('?') || key.startsWith('#')),
  );
  const root = roots[0]?.opml;
  if (roots.length !== 1 || !Array.isArray(root))
    throw new HttpError(400, '请选择有效的 OPML 文件。');
  const bodies = root.filter((node) => 'body' in node);
  const body = bodies[0]?.body;
  if (bodies.length !== 1 || !Array.isArray(body))
    throw new HttpError(400, 'OPML 必须包含一个 body。');
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
  return value
    .replace(/\p{Cc}/gu, (character) => {
      const code = character.charCodeAt(0);
      return code > 31 || character === '\t' || character === '\n' || character === '\r'
        ? character
        : '';
    })
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function renderOpml(feeds: Feed[]): string {
  type Folder = { folders: Map<string, Folder>; feeds: Feed[] };
  const root: Folder = { folders: new Map(), feeds: [] };
  for (const feed of feeds) {
    let folder = root;
    for (const segment of feed.category ? feed.category.split(' / ') : []) {
      let child = folder.folders.get(segment);
      if (!child) {
        child = { folders: new Map(), feeds: [] };
        folder.folders.set(segment, child);
      }
      folder = child;
    }
    folder.feeds.push(feed);
  }
  function render(folder: Folder): string {
    return (
      [...folder.folders]
        .map(
          ([name, child]) =>
            `<outline text="${xmlEscape(name)}" title="${xmlEscape(name)}">${render(child)}</outline>`,
        )
        .join('') +
      folder.feeds
        .map(
          (feed) =>
            `<outline type="rss" text="${xmlEscape(feed.title)}" title="${xmlEscape(feed.title)}" xmlUrl="${xmlEscape(feed.url)}" htmlUrl="${xmlEscape(feed.siteUrl)}"/>`,
        )
        .join('')
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>Daily Signal 订阅</title></head><body>${render(root)}</body></opml>\n`;
}
