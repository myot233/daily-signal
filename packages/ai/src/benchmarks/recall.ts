import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { articleSchema } from '@daily-signal/domain';
import { curationSettingsSchema } from '@daily-signal/domain/curation';

const fixtureDirectory = new URL('../../../../docs/benchmarks/rss-recall/', import.meta.url);
export function readBenchmarkJson(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, fixtureDirectory), 'utf8'));
}

export const benchmarkInput = z
  .object({
    id: z.string().min(1),
    date: z.iso.date(),
    settings: curationSettingsSchema,
    articles: z.array(articleSchema.pick({ id: true, title: true, url: true, content: true })),
  })
  .parse(readBenchmarkJson('input.json'));

const eventSchema = z.object({
  id: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).min(1),
  relevant: z.boolean(),
  reason: z.string().min(1),
});
const resultSchema = z.object({
  benchmarkId: z.literal(benchmarkInput.id),
  kind: z.enum(['example', 'model', 'manual']),
  curation: z.object({ cards: z.array(z.object({ sourceIds: z.array(z.string()).min(1) })) }),
});
const baselineSchema = z
  .object({
    benchmarkId: z.literal(benchmarkInput.id),
    minRecall: z.number().min(0).max(1),
    minPrecision: z.number().min(0).max(1),
    maxCards: z.number().int().positive(),
  })
  .strict();

export function scoreRecall(rawResult: unknown) {
  // Labels are only read by the scorer, after generation has finished.
  const events = z.array(eventSchema).parse(readBenchmarkJson('labels.json'));
  const articleIds = new Set(benchmarkInput.articles.map((article) => article.id));
  const labeledIds = events.flatMap((event) => event.sourceIds);
  if (
    articleIds.size !== benchmarkInput.articles.length ||
    new Set(events.map((event) => event.id)).size !== events.length ||
    new Set(labeledIds).size !== labeledIds.length ||
    labeledIds.length !== articleIds.size ||
    labeledIds.some((id) => !articleIds.has(id))
  )
    throw new Error('样本 ID 必须唯一，每篇文章必须且只能标注到一个事件。');

  const result = resultSchema.parse(rawResult);
  const selectedIds = new Set(result.curation.cards.flatMap((card) => card.sourceIds));
  const unknownIds = [...selectedIds].filter((id) => !articleIds.has(id));
  if (unknownIds.length) throw new Error(`结果包含未知来源 ID：${unknownIds.join(', ')}`);
  const expected = events.filter((event) => event.relevant);
  if (!expected.length) throw new Error('至少需要一个应入选事件才能计算召回率。');
  const selected = events.filter((event) => event.sourceIds.some((id) => selectedIds.has(id)));
  const hits = selected.filter((event) => event.relevant);
  const hitIds = new Set(hits.map((event) => event.id));
  const recall = hits.length / expected.length;
  const precision = selected.length ? hits.length / selected.length : 0;
  const cardCount = result.curation.cards.length;
  const baseline = baselineSchema.parse(readBenchmarkJson('baseline.json'));
  const checks = {
    recall: recall >= baseline.minRecall,
    precision: precision >= baseline.minPrecision,
    cardCount: cardCount <= baseline.maxCards,
  };
  return {
    benchmarkId: benchmarkInput.id,
    kind: result.kind,
    articleCount: benchmarkInput.articles.length,
    expectedEventCount: expected.length,
    recalledEventCount: hits.length,
    selectedEventCount: selected.length,
    recall,
    precision,
    cardCount,
    baseline: { ...baseline, checks, passed: Object.values(checks).every(Boolean) },
    missed: expected.filter((event) => !hitIds.has(event.id)),
    unexpected: selected.filter((event) => !event.relevant),
  };
}
