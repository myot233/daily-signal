import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { eq } from 'drizzle-orm';
import { digestInputSchema, settingsSchema } from '../../../shared/types';
import type { DigestGenerationProgress, DigestInput } from '../../../shared/types';
import { createLegacyRuntimeModel } from '../providers/adapters';
import type { ProviderTransport } from '../providers/transport';
import { HttpError } from '../../core/errors';

// Test-only loading boundary: select the isolated DB before importing its modules.
process.env.DATABASE_PATH = ':memory:';
const { db } = await import('../../infrastructure/database/client');
const { getSettings } = await import('../settings/repository');
const { getState } = await import('../state/service');
const { articles, digests, feeds, providerCredentials, providerModels, providers, settings } =
  await import('../../infrastructure/database/schema');
const { generateDigest, testConnection } = await import('./service');
const input = {
  date: '2026-09-10',
  startAt: '2026-09-10T00:00:00.000Z',
  endAt: '2026-09-11T00:00:00.000Z',
  apiKey: 'KEY-SENTINEL-NEVER-PERSIST',
} satisfies DigestInput;

beforeEach(() => {
  db.delete(digests).run();
  db.delete(feeds).run();
  db.delete(providerCredentials).run();
  db.insert(feeds)
    .values({
      id: 'feed',
      url: 'https://example.com/rss',
      title: 'Engineering',
      category: 'Tech',
      siteUrl: 'https://example.com',
      createdAt: input.startAt,
    })
    .run();
  const defaultModelId = db
    .select({ id: settings.defaultProviderModelId })
    .from(settings)
    .where(eq(settings.id, 1))
    .get()!.id!;
  const providerId = db
    .select({ id: providerModels.providerId })
    .from(providerModels)
    .where(eq(providerModels.id, defaultModelId))
    .get()!.id;
  db.update(providers)
    .set({
      presetId: 'openai',
      protocol: 'openai-chat-completions',
      baseUrl: 'https://api.openai.com/v1',
      options: { timeoutMs: 120_000, maxOutputTokens: 6_000, deepseekThinking: 'disabled' },
    })
    .where(eq(providers.id, providerId))
    .run();
  db.update(providerModels)
    .set({ modelId: 'test-model', enabled: true })
    .where(eq(providerModels.id, defaultModelId))
    .run();
  db.update(settings)
    .set({
      value: { ...getSettings(), baseUrl: 'https://api.openai.com/v1', model: 'test-model' },
      apiKey: null,
    })
    .where(eq(settings.id, 1))
    .run();
});
function addArticle(
  id: string,
  content = 'A concrete release with a migration guide.',
  publishedAt = '2026-09-10T12:00:00.000Z',
  feedId = 'feed',
  url = `https://example.com/${id}`,
) {
  db.insert(articles)
    .values({ id, feedId, title: `Release ${id}`, url, content, publishedAt, dateEstimated: false })
    .run();
}
function providerWithResponses(
  respond: (body: {
    messages: { role: string; content: string }[];
    max_tokens?: number;
  }) => Response | Promise<Response>,
) {
  return createOpenAICompatible({
    name: 'test',
    baseURL: 'https://model.example.com/v1',
    apiKey: input.apiKey,
    fetch: async (_url, init) => respond(JSON.parse(String(init?.body))),
  }).chatModel('test-model');
}
function completionResponse(content: string, reason = 'stop') {
  return Response.json({
    id: 'test-completion',
    object: 'chat.completion',
    created: 1,
    model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: reason }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

test('empty local day costs nothing, and date boundaries include start but exclude end', async () => {
  let requests = 0;
  const model = providerWithResponses(() => {
    requests++;
    return completionResponse('## 今日重点\nA release.');
  });
  await assert.rejects(
    generateDigest(input, { model }),
    (error) => error instanceof HttpError && error.status === 400,
  );
  assert.equal(requests, 0);
  addArticle('at-start', 'First item', input.startAt);
  addArticle('at-end', 'Next day item', input.endAt);
  const report = await generateDigest(
    {
      ...input,
      startAt: input.startAt.replace('.000', ''),
      endAt: input.endAt.replace('.000', ''),
    },
    { model },
  );
  assert.deepEqual(
    report.sources.map((source) => source.id),
    ['at-start'],
  );
  assert.equal(requests, 1);
});

test('cross-feed duplicates preserve the fuller source and archived provenance survives feed deletion', async () => {
  db.insert(feeds)
    .values({
      id: 'second',
      url: 'https://other.example.com/feed',
      title: 'Second',
      createdAt: input.startAt,
    })
    .run();
  addArticle('short', 'short', undefined, 'feed', 'https://example.com/release');
  addArticle(
    'full',
    'A longer factual release announcement.',
    undefined,
    'second',
    'https://example.com/release#section',
  );
  const model = providerWithResponses(() => completionResponse('## 今日重点\nA real release.'));
  const report = await generateDigest(input, { model });
  assert.equal(report.articleCount, 1);
  assert.equal(report.sources[0]?.id, 'full');
  assert.match(report.markdown, /https:\/\/example.com\/release/);
  db.delete(feeds).run();
  assert.equal(getState().digests[0]?.sources[0]?.title, 'Release full');
  assert.equal(JSON.stringify(getState()).includes(input.apiKey), false);
});

test('multiple batches cover the final article, and a failed synthesis preserves the old report', async () => {
  for (let index = 0; index < 12; index++)
    addArticle(`item-${index}`, `${index}: ${'Content. '.repeat(660)}`);
  let requests = 0;
  const seen = new Set<string>();
  const progress: DigestGenerationProgress[] = [];
  const successfulModel = providerWithResponses((body) => {
    requests++;
    const prompt = body.messages.find((message) => message.role === 'user')?.content ?? '';
    for (let index = 0; index < 12; index++)
      if (prompt.includes(`"id":"item-${index}"`)) seen.add(`item-${index}`);
    return completionResponse('## 今日重点\nDocumented release.');
  });
  const saved = await generateDigest(input, {
    model: successfulModel,
    onProgress: (event) => progress.push(event),
  });
  assert.equal(saved.articleCount, 12);
  assert.equal(seen.size, 12);
  assert.ok(requests > 1, 'Large input must be batched');
  const prepared = progress[0];
  assert.equal(prepared?.type, 'preparing');
  if (prepared?.type !== 'preparing') assert.fail('Preparation progress was not emitted.');
  assert.equal(prepared.articleCount, 12);
  const extractions = progress.filter((event) => event.type === 'extracting');
  assert.equal(extractions.length, prepared.batchCount);
  assert.deepEqual(
    extractions.map((event) => event.current),
    Array.from({ length: prepared.batchCount }, (_, index) => index + 1),
  );
  assert.deepEqual(
    progress.slice(-2).map((event) => event.type),
    ['synthesizing', 'archiving'],
  );
  const failingModel = providerWithResponses((body) => {
    const prompt = body.messages.find((message) => message.role === 'user')?.content ?? '';
    return prompt.includes('资料批次')
      ? completionResponse('Extracted facts.')
      : completionResponse('Truncated draft', 'length');
  });
  await assert.rejects(
    generateDigest(input, { model: failingModel }),
    (error) => error instanceof HttpError && error.status === 502,
  );
  assert.deepEqual(
    getState().digests.map((report) => report.id),
    [saved.id],
  );
});

test('six extraction batches honor the saved output ceiling even without explicit thinking options', async () => {
  const state = getState();
  const selected = state.providers.find((provider) =>
    provider.models.some((model) => model.id === state.defaultProviderModelId),
  )!;
  db.update(providers)
    .set({ options: { ...selected.options, maxOutputTokens: 36_000 } })
    .where(eq(providers.id, selected.id))
    .run();
  for (let index = 0; index < 24; index++) addArticle(`batch-${index}`, 'Content. '.repeat(660));
  const budgets: number[] = [];
  let extractionCalls = 0;
  const model = providerWithResponses((body) => {
    budgets.push(body.max_tokens!);
    const extracting = body.messages.some(
      (message) => message.role === 'user' && message.content.includes('资料批次'),
    );
    if (extracting) extractionCalls++;
    // Reproduce a batch that cannot finish inside the old hidden 2,000 cap.
    return extractionCalls === 3 && extracting && (body.max_tokens ?? 0) < 3_000
      ? completionResponse('Truncated extraction', 'length')
      : completionResponse(extracting ? 'Concise complete facts.' : 'Complete daily report.');
  });
  const report = await generateDigest(input, { model });
  assert.equal(extractionCalls, 6);
  assert.deepEqual(budgets, Array(7).fill(36_000));
  assert.equal(report.articleCount, 24);
  assert.match(report.markdown, /Complete daily report/);
  assert.equal(getState().digests.length, 1);
});

test('extraction respects a smaller configured ceiling and never archives or retries truncated output', async () => {
  const state = getState();
  const selected = state.providers.find((provider) =>
    provider.models.some((model) => model.id === state.defaultProviderModelId),
  )!;
  db.update(providers)
    .set({ options: { ...selected.options, maxOutputTokens: 1_024 } })
    .where(eq(providers.id, selected.id))
    .run();
  for (let index = 0; index < 6; index++) addArticle(`limited-${index}`, 'Content. '.repeat(660));
  let calls = 0;
  const model = providerWithResponses((body) => {
    calls++;
    assert.equal(body.max_tokens, 1_024);
    return completionResponse('Incomplete facts.', 'length');
  });
  await assert.rejects(generateDigest(input, { model }), (error) => {
    assert.ok(error instanceof HttpError);
    assert.match(error.message, /资料提取 1\/2未完成/);
    assert.match(error.message, /提高输出上限/);
    return true;
  });
  assert.equal(calls, 1);
  assert.equal(getState().digests.length, 0);
});

test('upstream authentication and quota errors are sanitized and never retried', async () => {
  addArticle('release');
  for (const status of [401, 429]) {
    let calls = 0;
    const model = providerWithResponses(() => {
      calls++;
      return Response.json(
        { error: { message: input.apiKey, type: 'provider_error' } },
        { status },
      );
    });
    await assert.rejects(generateDigest(input, { model }), (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 502);
      assert.equal(error.message.includes(input.apiKey), false);
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(getState().digests.length, 0);
  }
});

test('empty output, incomplete output and cancellation never create a report', async () => {
  addArticle('release');
  for (const [text, reason] of [
    ['', 'stop'],
    ['Partial', 'length'],
    ['Filtered', 'content_filter'],
  ]) {
    await assert.rejects(
      generateDigest(input, {
        model: providerWithResponses(() => completionResponse(text!, reason)),
      }),
      HttpError,
    );
    assert.equal(getState().digests.length, 0);
  }
  await assert.rejects(
    generateDigest(input, {
      model: providerWithResponses(() => completionResponse('unused')),
      signal: AbortSignal.abort(),
    }),
    (error) => error instanceof HttpError && error.status === 504,
  );
  assert.equal(getState().digests.length, 0);
});

test('cost limit rejects before contacting a provider', async () => {
  for (let index = 0; index < 60; index++) addArticle(`large-${index}`, 'x'.repeat(6_000));
  let calls = 0;
  await assert.rejects(
    generateDigest(input, {
      model: providerWithResponses(() => {
        calls++;
        return completionResponse('unused');
      }),
    }),
    (error) => error instanceof HttpError && error.status === 400,
  );
  assert.equal(calls, 0);
});

test('shared schema permits DST days and refuses secrets in public settings', () => {
  for (const date of [
    { date: '2026-03-08', startAt: '2026-03-08T05:00:00.000Z', endAt: '2026-03-09T04:00:00.000Z' },
    { date: '2026-11-01', startAt: '2026-11-01T04:00:00.000Z', endAt: '2026-11-02T05:00:00.000Z' },
  ])
    assert.equal(digestInputSchema.safeParse({ ...input, ...date }).success, true);
  assert.equal(digestInputSchema.safeParse({ ...input, endAt: input.startAt }).success, false);
  assert.equal(digestInputSchema.safeParse({ ...input, apiKey: 'secret\n' }).success, false);
  assert.equal(settingsSchema.safeParse({ ...getSettings(), apiKey: input.apiKey }).success, false);
});

test('connection test accepts a successful nonempty response without depending on exact wording', async () => {
  const { baseUrl, model, deepseekThinking } = getSettings();
  await testConnection(
    { baseUrl, model, deepseekThinking, apiKey: input.apiKey },
    { model: providerWithResponses(() => completionResponse('Connected.')) },
  );
  assert.equal(getState().digests.length, 0);
});

test('connection tests and digests use the saved key without returning it', async () => {
  const apiKey = 'DB-CREDENTIAL-SENTINEL';
  const defaultModelId = db
    .select({ id: settings.defaultProviderModelId })
    .from(settings)
    .where(eq(settings.id, 1))
    .get()!.id!;
  const providerId = db
    .select({ id: providerModels.providerId })
    .from(providerModels)
    .where(eq(providerModels.id, defaultModelId))
    .get()!.id;
  db.insert(providerCredentials)
    .values({ providerId, apiKey, updatedAt: new Date().toISOString() })
    .run();
  const authorizations: string[] = [];
  const transport: ProviderTransport = async (_url, options) => {
    authorizations.push(new Headers(options?.headers).get('authorization') ?? '');
    return { text: await completionResponse('A complete answer.').text(), status: 200, ok: true };
  };
  const { baseUrl, model, deepseekThinking } = getSettings();
  await testConnection({ baseUrl, model, deepseekThinking }, { transport });
  addArticle('saved-key-release');
  const report = await generateDigest({ ...input, apiKey: undefined }, { transport });
  assert.deepEqual(authorizations, [`Bearer ${apiKey}`, `Bearer ${apiKey}`]);
  assert.equal(JSON.stringify(report).includes(apiKey), false);
  assert.equal(JSON.stringify(getState()).includes(apiKey), false);
  assert.equal(getState().hasApiKey, true);
  await testConnection({ baseUrl, model, deepseekThinking, apiKey: 'ONE-OFF-KEY' }, { transport });
  assert.equal(authorizations.at(-1), 'Bearer ONE-OFF-KEY');
  assert.equal(
    db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.providerId, providerId))
      .get()?.apiKey,
    apiKey,
  );
});

test('missing keys and changed test endpoints reject before network access', async () => {
  let requests = 0;
  const model = providerWithResponses(() => {
    requests++;
    return completionResponse('unused');
  });
  const configuration = getSettings();
  const connection = {
    baseUrl: configuration.baseUrl,
    model: configuration.model,
    deepseekThinking: configuration.deepseekThinking,
  };
  await assert.rejects(
    testConnection(connection, { model }),
    (error) => error instanceof HttpError && error.status === 400,
  );
  await assert.rejects(
    generateDigest({ ...input, apiKey: undefined }, { model }),
    (error) => error instanceof HttpError && error.status === 400,
  );
  db.update(settings).set({ apiKey: 'ORIGINAL-ENDPOINT-KEY' }).where(eq(settings.id, 1)).run();
  await assert.rejects(
    testConnection({ ...connection, baseUrl: 'https://other.example.com/v1' }, { model }),
    (error) => error instanceof HttpError && error.status === 400,
  );
  assert.equal(requests, 0);
});

test('DeepSeek thinking defaults cannot consume the summary budget before the answer', async () => {
  const configuration = {
    ...getSettings(),
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  };
  const model = createLegacyRuntimeModel(configuration, input.apiKey, async (_url, options) => {
    const request = JSON.parse(options?.body ?? '{}');
    // Model the provider's default: high-effort reasoning exhausts a small cap.
    const reasoningConsumesBudget = request.thinking?.type !== 'disabled';
    return {
      text: await completionResponse(
        reasoningConsumesBudget ? '' : '## 今日重点\nA complete answer.',
        reasoningConsumesBudget ? 'length' : 'stop',
      ).text(),
      status: 200,
      ok: true,
    };
  }).model;
  const { baseUrl, model: modelId, deepseekThinking } = configuration;
  await testConnection(
    { baseUrl, model: modelId, deepseekThinking, apiKey: input.apiKey },
    { model },
  );
  addArticle('deepseek-release');
  db.update(settings).set({ value: configuration }).where(eq(settings.id, 1)).run();
  const report = await generateDigest(input, { model });
  assert.match(report.markdown, /A complete answer/);
  assert.equal(getState().digests[0]?.id, report.id);
});

test('DeepSeek mode does not break other compatible providers with unknown parameters', async () => {
  const configuration = { ...getSettings(), baseUrl: 'https://api.openai.com/v1' };
  const model = createLegacyRuntimeModel(configuration, input.apiKey, async (_url, options) => {
    const request = JSON.parse(options?.body ?? '{}');
    if ('thinking' in request)
      return {
        text: JSON.stringify({ error: { message: 'Unsupported parameter' } }),
        status: 400,
        ok: false,
      };
    return { text: await completionResponse('Connected.').text(), status: 200, ok: true };
  }).model;
  const { baseUrl, model: modelId, deepseekThinking } = configuration;
  await testConnection(
    { baseUrl, model: modelId, deepseekThinking, apiKey: input.apiKey },
    { model },
  );
  assert.equal(getState().digests.length, 0);
});
