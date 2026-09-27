import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { Article } from '../../../shared/types';
import type { SourceDocument } from '../../../shared/curation';
import { fetchPublicText } from '../../infrastructure/network/public-fetch';

export async function loadArticleDocument(
  source: Article,
  enabled: boolean,
  signal: AbortSignal,
  transport: typeof fetchPublicText = fetchPublicText,
): Promise<SourceDocument> {
  const fallback: SourceDocument = {
    sourceId: source.id,
    content: source.content || source.title,
    kind: 'feed',
    status: enabled ? 'unavailable' : 'feed-only',
  };
  if (!enabled) return fallback;
  try {
    signal.throwIfAborted();
    const response = await transport(source.url, {
      signal,
      timeoutMs: 12_000,
      maxBytes: 1_000_000,
    });
    if (!response.ok) return fallback;
    // linkedom parses a string only: no scripts execute and no subresources load.
    // Persist and display plain text, never the extracted HTML.
    const { document } = parseHTML(response.text);
    const result = new Readability(document, { maxElemsToParse: 15_000 }).parse();
    const content = result?.textContent?.replace(/\s+/g, ' ').trim();
    signal.throwIfAborted();
    if (!content || content.length < Math.max(200, source.content.length)) return fallback;
    return {
      sourceId: source.id,
      content: content.slice(0, 12_000),
      kind: 'web',
      status: 'extracted',
    };
  } catch {
    signal.throwIfAborted();
    return fallback;
  }
}
