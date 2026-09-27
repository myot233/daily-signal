import { connectionSchema } from '@daily-signal/domain';
import type { generateDigest } from '../service';
import { benchmarkInput } from './recall';

// One isolated run per process, matching the CLI entry point.
export async function generateBenchmarkResult(
  rawConnection: unknown,
  options: Parameters<typeof generateDigest>[1] = {},
) {
  const connection = connectionSchema.required({ apiKey: true }).parse(rawConnection);
  process.env.DATABASE_PATH = ':memory:';
  const { db, sqlite } = await import('@daily-signal/database');
  try {
    const { articles, feeds, settings } = await import('@daily-signal/database/schema');
    const { getSettings } = await import('@daily-signal/settings');
    const { replaceLegacyDefaultConnection } = await import('@daily-signal/providers');
    const { generateDigest } = await import('../service');
    const startAt = `${benchmarkInput.date}T00:00:00.000Z`;
    const endAt = new Date(Date.parse(startAt) + 86_400_000).toISOString();
    db.insert(feeds)
      .values({
        id: 'benchmark',
        url: 'https://example.com/rss',
        title: 'Benchmark RSS',
        createdAt: startAt,
      })
      .run();
    db.insert(articles)
      .values(
        benchmarkInput.articles.map((article) => ({
          ...article,
          feedId: 'benchmark',
          publishedAt: startAt,
          dateEstimated: false,
        })),
      )
      .run();
    db.update(settings)
      .set({ value: { ...getSettings(), curation: benchmarkInput.settings } })
      .run();
    replaceLegacyDefaultConnection(connection, connection.apiKey);
    const digest = await generateDigest({ date: benchmarkInput.date, startAt, endAt }, options);
    return {
      benchmarkId: benchmarkInput.id,
      kind: 'model',
      model: digest.model,
      baseUrl: connection.baseUrl,
      createdAt: digest.createdAt,
      providerProtocol: digest.providerProtocol,
      providerOptions: digest.providerOptions,
      curation: digest.curation,
      markdown: digest.markdown,
    };
  } finally {
    sqlite.close();
  }
}
