import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { eq } from 'drizzle-orm';
import { curationSettingsSchema } from '@daily-signal/domain/curation';
import type { Article, DigestGenerationProgress } from '@daily-signal/domain';
import { HttpError } from '@daily-signal/domain/errors';
import { loadArticleDocument } from './article-document';

process.env.DATABASE_PATH = ':memory:';
const { db } = await import('@daily-signal/database');
const { articles, feeds, settings, digests, articleAnalyses } =
  await import('@daily-signal/database/schema');
const { getSettings } = await import('@daily-signal/settings');
const { listArticles } = await import('@daily-signal/feeds/repository');
const { generateDigest } = await import('./service');
const input = {
  date: '2026-09-10',
  startAt: '2026-09-10T00:00:00.000Z',
  endAt: '2026-09-11T00:00:00.000Z',
  apiKey: 'CURATION-KEY-NEVER-PERSIST',
};

beforeEach(() => {
  db.delete(digests).run();
  db.delete(feeds).run();
  db.insert(feeds)
    .values({
      id: 'feed',
      url: 'https://example.com/rss',
      title: '工程周刊',
      createdAt: input.startAt,
    })
    .run();
  db.update(settings)
    .set({
      value: {
        ...getSettings(),
        curation: curationSettingsSchema.parse({
          tags: ['Rust', '数据库'],
          maxPerCategory: 1,
          fetchFullText: false,
        }),
      },
    })
    .where(eq(settings.id, 1))
    .run();
});

function addArticle(
  id: string,
  content = `${id}: The release includes reproducible benchmarks and documented implementation tradeoffs.`,
  url = `https://example.com/${id}`,
) {
  db.insert(articles)
    .values({
      id,
      feedId: 'feed',
      title: id,
      content,
      url,
      publishedAt: '2026-09-10T12:00:00.000Z',
      dateEstimated: false,
    })
    .run();
}
interface Payload {
  articles?: Article[];
  tags?: string[];
  sources?: Array<{ sourceId: string; content: string; kind: string }>;
}
function defaultResponse(payload: Payload): unknown {
  if (payload.tags && payload.articles)
    return {
      items: payload.articles.map((article) => ({
        id: article.id,
        category: 'engineering',
        kind: 'engineering',
        matchedTags: article.id.startsWith('noise')
          ? []
          : [article.id.startsWith('db') ? payload.tags!.at(-1)! : payload.tags![0]!],
        relevance: article.id.startsWith('noise') ? 2 : 9,
        quality: 8,
        reason: '包含可复现的数据和实现细节。',
      })),
    };
  if (payload.articles) {
    const groups: string[][] = [];
    const release = payload.articles
      .filter((article) => article.id.startsWith('rust-release'))
      .map((article) => article.id);
    if (release.length) groups.push(release);
    for (const article of payload.articles)
      if (!release.includes(article.id)) groups.push([article.id]);
    return { groups };
  }
  const source = payload.sources![0]!;
  return {
    title: `精选：${source.sourceId}`,
    summary: '该版本提供了可复现的基准和实现取舍。',
    impact: '可以对照自己的工作负载验证。',
    evidence: [{ sourceId: source.sourceId, quote: source.content.slice(0, 100) }],
  };
}
function makeModel(respond: (payload: Payload) => unknown = defaultResponse, finish = 'stop') {
  const seen: Payload[] = [];
  const model = createOpenAICompatible({
    name: 'test',
    baseURL: 'https://model.example.com/v1',
    apiKey: input.apiKey,
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      const payload = JSON.parse(
        request.messages.find((message) => message.role === 'user')!.content,
      ) as Payload;
      seen.push(payload);
      return Response.json({
        id: 'curation-test',
        object: 'chat.completion',
        created: 1,
        model: 'test',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(respond(payload)) },
            finish_reason: finish,
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
      });
    },
  }).chatModel('test');
  return { model, seen };
}

test('curated generation deduplicates, groups events, applies tag quotas and archives evidence', async () => {
  addArticle('rust-release-a');
  addArticle('rust-release-b');
  addArticle('rust-tutorial');
  addArticle('db-guide');
  addArticle('noise-ad');
  addArticle(
    'short-duplicate',
    'short',
    'https://example.com/rust-release-a?utm_source=news#heading',
  );
  const { model } = makeModel();
  const progress: DigestGenerationProgress[] = [];
  const report = await generateDigest(input, {
    model,
    onProgress: (event) => progress.push(event),
  });
  const curated = report.curation!;
  assert.equal(curated.stats.inputCount, 6);
  assert.equal(curated.stats.uniqueCount, 5);
  assert.equal(curated.stats.eligibleCount, 4);
  assert.equal(curated.stats.eventCount, 3);
  assert.equal(curated.cards.length, 2);
  assert.ok(
    curated.cards.some(
      (card) =>
        card.sourceIds.includes('rust-release-a') && card.sourceIds.includes('rust-release-b'),
    ),
  );
  assert.ok(curated.cards.some((card) => card.sourceIds.includes('db-guide')));
  assert.ok(curated.cards.every((card) => !card.sourceIds.includes('noise-ad')));
  assert.equal(curated.stats.modelCalls, 4);
  assert.equal(curated.stats.inputTokens, 120);
  assert.equal(curated.stats.outputTokens, 80);
  assert.match(report.markdown, /https:\/\/example.com\/rust-release/);
  assert.deepEqual(
    progress.map((event) => event.type),
    ['screening', 'screening', 'clustering', 'enriching', 'enriching', 'archiving'],
  );
  db.delete(feeds).run();
  assert.equal(db.select().from(articleAnalyses).all().length, 0);
  const archived = db.select().from(digests).get()!;
  assert.deepEqual(archived.curation, curated);
  assert.deepEqual(archived.sources, report.sources);
  assert.equal(JSON.stringify(archived).includes(input.apiKey), false);
});

test('both positive and negative analyses are reused; article and tag edits invalidate only their inputs', async () => {
  addArticle('rust-guide');
  addArticle('noise-ad');
  const first = makeModel();
  await generateDigest(input, first);
  const second = makeModel();
  const reused = await generateDigest(input, second);
  assert.equal(reused.curation!.stats.cachedCount, 2);
  assert.equal(
    second.seen.some((payload) => payload.articles),
    false,
  );
  db.update(articles)
    .set({ content: 'Changed article with a new benchmark and detailed implementation.' })
    .where(eq(articles.id, 'rust-guide'))
    .run();
  const changed = makeModel();
  await generateDigest(input, changed);
  assert.deepEqual(
    changed.seen
      .filter((payload) => payload.tags && payload.articles)
      .flatMap((payload) => payload.articles!.map((article) => article.id)),
    ['rust-guide'],
  );
  const current = getSettings();
  db.update(settings)
    .set({ value: { ...current, curation: { ...current.curation, tags: ['安全'] } } })
    .where(eq(settings.id, 1))
    .run();
  const newTags = await generateDigest(input, makeModel());
  assert.equal(newTags.curation!.stats.cachedCount, 0);
  assert.deepEqual(newTags.curation!.cards[0]!.tags, ['安全']);
});

test('invalid evidence cannot replace a successful archive, and valid screening survives for retry', async () => {
  addArticle('rust-release');
  const saved = await generateDigest(input, makeModel());
  const invalid = makeModel((payload) =>
    payload.sources
      ? {
          title: '坏引用',
          summary: '未知事实',
          impact: '',
          evidence: [
            {
              sourceId: payload.sources[0]!.sourceId,
              quote: 'This quote is fabricated and does not occur in the source.',
            },
          ],
        }
      : defaultResponse(payload),
  );
  await assert.rejects(
    generateDigest(input, invalid),
    (error) => error instanceof HttpError && /引用不完整/.test(error.message),
  );
  assert.equal(invalid.seen.length, 2, 'Only one repair attempt is allowed');
  assert.deepEqual(
    db
      .select()
      .from(digests)
      .all()
      .map((item) => item.id),
    [saved.id],
  );
  const retry = await generateDigest(input, makeModel());
  assert.equal(retry.curation!.stats.cachedCount, 1);
});

test('screening refuses missing, duplicate and unknown IDs or unselected tags without caching invented decisions', async () => {
  addArticle('rust-a');
  addArticle('rust-b');
  const invalidResults = [
    { items: [] },
    { items: [{ id: 'unknown' }] },
    {
      items: ['rust-a', 'rust-a'].map((id) => ({
        id,
        category: 'engineering',
        kind: 'news',
        relevance: 8,
        quality: 8,
        reason: '有依据',
        matchedTags: ['Rust'],
      })),
    },
    {
      items: ['rust-a', 'rust-b'].map((id) => ({
        id,
        category: 'engineering',
        kind: 'news',
        relevance: 8,
        quality: 8,
        reason: '有依据',
        matchedTags: ['不是用户的标签'],
      })),
    },
  ];
  for (const invalidResult of invalidResults) {
    const invalid = makeModel(() => invalidResult);
    await assert.rejects(generateDigest(input, invalid), HttpError);
    assert.equal(invalid.seen.length, 2);
    assert.equal(db.select().from(articleAnalyses).all().length, 0);
  }
});

test('event grouping cannot silently omit or duplicate a candidate', async () => {
  addArticle('rust-a');
  addArticle('db-b');
  const invalid = makeModel((payload) =>
    payload.articles && !payload.tags
      ? { groups: [['rust-a', 'rust-a']] }
      : defaultResponse(payload),
  );
  await assert.rejects(generateDigest(input, invalid), HttpError);
  assert.equal(db.select().from(digests).all().length, 0);
  assert.equal(db.select().from(articleAnalyses).all().length, 2);
});

test('empty selections finish without expensive stages and remain distinct from failed analyses', async () => {
  addArticle('noise-only');
  const first = await generateDigest(input, makeModel());
  assert.equal(first.curation!.cards.length, 0);
  assert.equal(first.curation!.stats.modelCalls, 1);
  const repeat = makeModel(() => {
    throw new Error('No paid requests should occur');
  });
  const cached = await generateDigest(input, repeat);
  assert.equal(cached.curation!.stats.modelCalls, 0);
  assert.match(cached.markdown, /没有符合/);
});

test('truncated responses are never retried or cached, and aborted runs cannot archive', async () => {
  addArticle('rust-a');
  const truncated = makeModel(defaultResponse, 'length');
  await assert.rejects(generateDigest(input, truncated), HttpError);
  assert.equal(truncated.seen.length, 1);
  assert.equal(db.select().from(articleAnalyses).all().length, 0);
  await assert.rejects(
    generateDigest(input, { ...makeModel(), signal: AbortSignal.abort() }),
    (error) => error instanceof HttpError && error.status === 504,
  );
  assert.equal(db.select().from(digests).all().length, 0);
});

test('article extraction returns plain text, never runs scripts, falls back on errors and respects cancellation', async () => {
  addArticle('rust-doc', 'A short RSS excerpt.');
  const source = listArticles()[0]!;
  const text =
    'This detailed engineering article explains benchmarks, tradeoffs and reproducible measurements. '.repeat(
      12,
    );
  const doc = await loadArticleDocument(source, true, new AbortController().signal, async () => ({
    ok: true,
    status: 200,
    text: `<html><head><title>Engineering</title></head><body><article><h1>Engineering</h1><p>${text}</p></article><script>throw new Error('executed')</script></body></html>`,
  }));
  assert.equal(doc.kind, 'web');
  assert.ok(doc.content.includes('reproducible measurements'));
  assert.ok(!doc.content.includes('<p>'));
  assert.ok(!doc.content.includes('executed'));
  const unavailable = await loadArticleDocument(
    source,
    true,
    new AbortController().signal,
    async () => {
      throw new Error('private detail');
    },
  );
  assert.equal(unavailable.content, source.content);
  assert.equal(unavailable.status, 'unavailable');
  const disabled = await loadArticleDocument(
    source,
    false,
    new AbortController().signal,
    async () => {
      throw new Error('must not fetch');
    },
  );
  assert.equal(disabled.status, 'feed-only');
  await assert.rejects(loadArticleDocument(source, true, AbortSignal.abort()));
});
