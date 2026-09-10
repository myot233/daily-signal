import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { eq } from 'drizzle-orm';
import { digestInputSchema, settingsSchema } from '../shared/types';
import type { DigestInput } from '../shared/types';
import { HttpError } from './errors';
import { MAX_READING_STEPS } from './webfetch';
import type { GenerationProgress } from '../shared/progress';

// Test-only loading boundary: select the isolated DB before importing its modules.
process.env.DATABASE_PATH = ':memory:';
const { db, defaultTemplate, getSettings, getState } = await import('./db');
const { articles, digests, feeds, settings } = await import('./schema');
const { configuredModel, generateDigest, testConnection } = await import('./ai');
const input: DigestInput = { date: '2026-09-10', startAt: '2026-09-10T00:00:00.000Z', endAt: '2026-09-11T00:00:00.000Z', apiKey: 'KEY-SENTINEL-NEVER-PERSIST' };

beforeEach(() => {
  db.delete(digests).run(); db.delete(feeds).run();
  db.insert(feeds).values({ id: 'feed', url: 'https://example.com/rss', title: 'Engineering', category: 'Tech', siteUrl: 'https://example.com', createdAt: input.startAt }).run();
  db.update(settings).set({ value: { ...getSettings(), model: 'test-model', template: defaultTemplate } }).where(eq(settings.id, 1)).run();
});
function addArticle(id: string, content = 'A concrete release with a migration guide.', publishedAt = '2026-09-10T12:00:00.000Z', feedId = 'feed', url = `https://example.com/${id}`) {
  db.insert(articles).values({ id, feedId, title: `Release ${id}`, url, content, publishedAt, dateEstimated: false }).run();
}
interface ProviderRequest {
  messages: { role: string; content: string }[];
  tools?: { function: { name: string } }[];
  tool_choice?: string;
}
function providerWithResponses(respond: (body: ProviderRequest) => Response | Promise<Response>) {
  return createOpenAICompatible({
    name: 'test', baseURL: 'https://model.example.com/v1', apiKey: input.apiKey,
    fetch: async (_url, init) => respond(JSON.parse(String(init?.body))),
  }).chatModel('test-model');
}
function completionResponse(content: string, reason = 'stop') {
  return Response.json({ id: 'test-completion', object: 'chat.completion', created: 1, model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: reason }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

function webfetchResponse(url: string, id = 'read-page') {
  return Response.json({ id: 'tool-completion', object: 'chat.completion', created: 1, model: 'test-model',
    choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [
      { id, type: 'function', function: { name: 'webfetch', arguments: JSON.stringify({ url }) } },
    ] }, finish_reason: 'tool_calls' }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
}

test('model reads a webpage through a tool, uses its result, and archives its evidence separately from RSS', async () => {
  addArticle('release', 'Short RSS summary');
  let calls = 0, fetches = 0;
  const progress: GenerationProgress[] = [];
  const model = providerWithResponses(body => {
    calls++;
    if (calls === 1) {
      assert.ok(body.tools?.some(tool => tool.function.name === 'webfetch'));
      return webfetchResponse('https://example.com/release');
    }
    const result = JSON.parse(body.messages.find(message => message.role === 'tool')?.content ?? '{}');
    assert.equal(result.status, 'success');
    assert.match(result.content, /Version 2 fixes the compiler/);
    assert.equal(result.truncated, false);
    return completionResponse('## 今日重点\nVersion 2 fixes the compiler.');
  });
  const report = await generateDigest(input, { model, onProgress: event => progress.push(event), fetchText: async (_url, options) => {
    fetches++;
    assert.ok(progress.some(event => event.kind === 'model' && event.status === 'running'));
    assert.ok(progress.some(event => event.kind === 'webfetch' && event.status === 'running'));
    assert.equal(progress.some(event => event.id === 'archive'), false);
    assert.equal(JSON.stringify(options).includes(input.apiKey), false);
    return { text: '<main><h1>Release</h1><p>Version 2 fixes the compiler.</p></main>', status: 200, ok: true, contentType: 'text/html' };
  } });
  assert.equal(calls, 2);
  assert.equal(fetches, 1);
  assert.equal(report.sources[0]?.content, 'Short RSS summary');
  assert.equal(report.sources[0]?.webFetch?.status, 'success');
  assert.equal(report.workflow.find(event => event.id === 'archive')?.status, 'success');
  assert.equal(report.workflow.filter(event => event.kind === 'model').length, 2);
  assert.ok(report.workflow.some(event => event.kind === 'webfetch' && event.status === 'success'));
  assert.equal(report.workflow.some(event => event.status === 'running' || event.status === 'queued'), false);
  assert.equal(JSON.stringify(progress).includes('Short RSS summary'), false);
  assert.equal(JSON.stringify(progress).includes(input.apiKey), false);
  assert.deepEqual(getState().digests[0]?.workflow, report.workflow);
  assert.match(report.markdown, /已读取网页文本/);
  assert.equal(getState().articles[0]?.webFetch, undefined);
  db.delete(feeds).run();
  assert.deepEqual(getState().digests[0]?.sources[0]?.webFetch, report.sources[0]?.webFetch);
  assert.equal(JSON.stringify(getState()).includes(input.apiKey), false);
});

test('page failures return to the model so it can finish from the RSS summary', async () => {
  addArticle('release');
  let calls = 0;
  const model = providerWithResponses(body => {
    if (++calls === 1) return webfetchResponse('https://example.com/release');
    const result = JSON.parse(body.messages.find(message => message.role === 'tool')?.content ?? '{}');
    assert.equal(result.status, 'error');
    assert.match(result.error, /HTTP 403/);
    return completionResponse('基于订阅摘要：发布了一项更新。');
  });
  const report = await generateDigest(input, { model, fetchText: async () => ({ text: 'Forbidden', status: 403, ok: false }) });
  assert.equal(calls, 2);
  assert.equal(report.sources[0]?.webFetch?.status, 'error');
  assert.match(report.markdown, /网页读取失败，使用订阅内容/);
});

test('repeated tool calls are cached and the final allowed step must write an answer', async () => {
  addArticle('release');
  let calls = 0, fetches = 0;
  const model = providerWithResponses(body => {
    calls++;
    if (calls < MAX_READING_STEPS) return webfetchResponse('https://example.com/release', `read-${calls}`);
    assert.equal(body.tools?.length ?? 0, 0);
    assert.match(body.messages.find(message => message.role === 'system')?.content ?? '', /网页读取阶段已结束/);
    return completionResponse('A finished digest.');
  });
  await generateDigest(input, { model, fetchText: async () => { fetches++; return { text: 'Page details', status: 200, ok: true, contentType: 'text/plain' }; } });
  assert.equal(calls, MAX_READING_STEPS);
  assert.equal(fetches, 1);
});

test('a model that never finishes its tool loop cannot create an incomplete report', async () => {
  addArticle('release');
  let calls = 0;
  const model = providerWithResponses(() => webfetchResponse('https://example.com/release', `read-${++calls}`));
  await assert.rejects(generateDigest(input, { model, fetchText: async () => ({ text: 'Page detail', status: 200, ok: true, contentType: 'text/plain' }) }), error => error instanceof HttpError && error.status === 502);
  assert.equal(calls, MAX_READING_STEPS);
  assert.equal(getState().digests.length, 0);
});

test('a provider that rejects tools returns an actionable error without leaking its response', async () => {
  addArticle('release');
  const model = providerWithResponses(() => Response.json({ error: { message: input.apiKey } }, { status: 400 }));
  await assert.rejects(generateDigest(input, { model }), error => {
    assert.ok(error instanceof HttpError);
    assert.match(error.message, /支持工具调用/);
    assert.equal(error.message.includes(input.apiKey), false);
    return true;
  });
  assert.equal(getState().digests.length, 0);
});

test('batches and synthesis share cached page results', async () => {
  for (let index = 0; index < 8; index++) addArticle(`item-${index}`, 'x'.repeat(6_000));
  let fetches = 0, stages = 0;
  const model = providerWithResponses(body => {
    if (body.messages.at(-1)?.role !== 'tool') {
      stages++;
      return webfetchResponse('https://example.com/item-0', `read-${stages}`);
    }
    assert.match(body.messages.at(-1)?.content ?? '', /Shared page detail/);
    return completionResponse('Shared page detail: https://example.com/item-0');
  });
  const report = await generateDigest(input, { model, fetchText: async () => { fetches++; return { text: 'Shared page detail', status: 200, ok: true, contentType: 'text/plain' }; } });
  assert.ok(stages > 2);
  assert.equal(fetches, 1);
  assert.equal(report.sources.filter(source => source.webFetch?.status === 'success').length, 1);
});

test('cancelling during a page read leaves no new report', async () => {
  addArticle('release');
  const controller = new AbortController();
  const model = providerWithResponses(() => webfetchResponse('https://example.com/release'));
  await assert.rejects(generateDigest(input, { model, signal: controller.signal, fetchText: async () => {
    controller.abort();
    throw new Error('PRIVATE-CANCEL-REASON');
  } }), error => error instanceof HttpError && error.status === 504 && !error.message.includes('PRIVATE-CANCEL-REASON'));
  assert.equal(getState().digests.length, 0);
});

test('digest templates receive the actual date and deduplicated sources before synthesis', async () => {
  addArticle('first', 'short', undefined, 'feed', 'https://example.com/release');
  addArticle('second', 'The fuller release announcement.', undefined, 'feed', 'https://example.com/release#details');
  db.update(settings).set({ value: { ...getSettings(), template: '# {{ date }} / {{ articleCount }}\n{% for article in articles %}{{ article.title }}{% endfor %}' } }).where(eq(settings.id, 1)).run();
  const model = providerWithResponses(body => {
    const instructions = body.messages.find(message => message.role === 'system')?.content ?? '';
    assert.match(instructions, /# 2026-09-10 \/ 1\nRelease second/);
    assert.equal(instructions.includes('{{'), false);
    return completionResponse('Rendered report.');
  });
  await generateDigest(input, { model });
});

test('invalid or empty rendered templates fail before any paid extraction call', async () => {
  for (let index = 0; index < 8; index++) addArticle(`item-${index}`, 'x'.repeat(6_000));
  let calls = 0;
  const model = providerWithResponses(() => { calls++; return completionResponse('unused'); });
  for (const template of ['{% if %}', '{{ missing }}', '{% if articleCount == 0 %}Nothing{% endif %}']) {
    db.update(settings).set({ value: { ...getSettings(), template } }).where(eq(settings.id, 1)).run();
    await assert.rejects(generateDigest(input, { model }), error => error instanceof HttpError && error.status === 400);
  }
  assert.equal(calls, 0);
  assert.equal(getState().digests.length, 0);
});

test('empty local day costs nothing, and date boundaries include start but exclude end', async () => {
  let requests = 0;
  const model = providerWithResponses(() => { requests++; return completionResponse('## 今日重点\nA release.'); });
  await assert.rejects(generateDigest(input, { model }), error => error instanceof HttpError && error.status === 400);
  assert.equal(requests, 0);
  addArticle('at-start', 'First item', input.startAt);
  addArticle('at-end', 'Next day item', input.endAt);
  const report = await generateDigest({ ...input, startAt: input.startAt.replace('.000', ''), endAt: input.endAt.replace('.000', '') }, { model });
  assert.deepEqual(report.sources.map(source => source.id), ['at-start']);
  assert.equal(requests, 1);
});

test('cross-feed duplicates preserve the fuller source and archived provenance survives feed deletion', async () => {
  db.insert(feeds).values({ id: 'second', url: 'https://other.example.com/feed', title: 'Second', createdAt: input.startAt }).run();
  addArticle('short', 'short', undefined, 'feed', 'https://example.com/release');
  addArticle('full', 'A longer factual release announcement.', undefined, 'second', 'https://example.com/release#section');
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
  for (let index = 0; index < 12; index++) addArticle(`item-${index}`, `${index}: ${'Content. '.repeat(660)}`);
  let requests = 0;
  const seen = new Set<string>();
  const successfulModel = providerWithResponses(body => {
    requests++;
    const prompt = body.messages.find(message => message.role === 'user')?.content ?? '';
    for (let index = 0; index < 12; index++) if (prompt.includes(`"id":"item-${index}"`)) seen.add(`item-${index}`);
    return completionResponse('## 今日重点\nDocumented release.');
  });
  const saved = await generateDigest(input, { model: successfulModel });
  assert.equal(saved.articleCount, 12);
  assert.equal(seen.size, 12);
  assert.ok(requests > 1, 'Large input must be batched');
  const failingModel = providerWithResponses(body => {
    const prompt = body.messages.find(message => message.role === 'user')?.content ?? '';
    return prompt.includes('资料批次') ? completionResponse('Extracted facts.') : completionResponse('Truncated draft', 'length');
  });
  await assert.rejects(generateDigest(input, { model: failingModel }), error => error instanceof HttpError && error.status === 502);
  assert.deepEqual(getState().digests.map(report => report.id), [saved.id]);
});

test('upstream authentication and quota errors are sanitized and never retried', async () => {
  addArticle('release');
  for (const status of [401, 429]) {
    let calls = 0;
    const model = providerWithResponses(() => { calls++; return Response.json({ error: { message: input.apiKey, type: 'provider_error' } }, { status }); });
    await assert.rejects(generateDigest(input, { model }), error => {
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
  for (const [text, reason] of [['', 'stop'], ['Partial', 'length'], ['Filtered', 'content_filter']]) {
    await assert.rejects(generateDigest(input, { model: providerWithResponses(() => completionResponse(text!, reason)) }), HttpError);
    assert.equal(getState().digests.length, 0);
  }
  await assert.rejects(generateDigest(input, { model: providerWithResponses(() => completionResponse('unused')), signal: AbortSignal.abort() }), error => error instanceof HttpError && error.status === 504);
  assert.equal(getState().digests.length, 0);
});

test('cost limit rejects before contacting a provider', async () => {
  for (let index = 0; index < 60; index++) addArticle(`large-${index}`, 'x'.repeat(6_000));
  let calls = 0;
  await assert.rejects(generateDigest(input, { model: providerWithResponses(() => { calls++; return completionResponse('unused'); }) }), error => error instanceof HttpError && error.status === 400);
  assert.equal(calls, 0);
});

test('shared schema permits DST days and refuses secrets in persistent settings', () => {
  for (const date of [
    { date: '2026-03-08', startAt: '2026-03-08T05:00:00.000Z', endAt: '2026-03-09T04:00:00.000Z' },
    { date: '2026-11-01', startAt: '2026-11-01T04:00:00.000Z', endAt: '2026-11-02T05:00:00.000Z' },
  ]) assert.equal(digestInputSchema.safeParse({ ...input, ...date }).success, true);
  assert.equal(digestInputSchema.safeParse({ ...input, endAt: input.startAt }).success, false);
  assert.equal(digestInputSchema.safeParse({ ...input, apiKey: 'secret\n' }).success, false);
  assert.equal(settingsSchema.safeParse({ ...getSettings(), apiKey: input.apiKey }).success, false);
});

test('connection test accepts a successful nonempty response without depending on exact wording', async () => {
  const { baseUrl, model, deepseekThinking } = getSettings();
  await testConnection({ baseUrl, model, deepseekThinking, apiKey: input.apiKey }, { model: providerWithResponses(() => completionResponse('Connected.')) });
  assert.equal(getState().digests.length, 0);
});

test('DeepSeek thinking defaults cannot consume the summary budget before the answer', async () => {
  const configuration = { ...getSettings(), baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' };
  const model = configuredModel(configuration, input.apiKey, async (_url, options) => {
    const request = JSON.parse(options?.body ?? '{}');
    // Model the provider's default: high-effort reasoning exhausts a small cap.
    const reasoningConsumesBudget = request.thinking?.type !== 'disabled';
    return { text: await completionResponse(reasoningConsumesBudget ? '' : '## 今日重点\nA complete answer.', reasoningConsumesBudget ? 'length' : 'stop').text(), status: 200, ok: true };
  });
  const { baseUrl, model: modelId, deepseekThinking } = configuration;
  await testConnection({ baseUrl, model: modelId, deepseekThinking, apiKey: input.apiKey }, { model });
  addArticle('deepseek-release');
  db.update(settings).set({ value: configuration }).where(eq(settings.id, 1)).run();
  const report = await generateDigest(input, { model });
  assert.match(report.markdown, /A complete answer/);
  assert.equal(getState().digests[0]?.id, report.id);
});

test('DeepSeek mode does not break other compatible providers with unknown parameters', async () => {
  const configuration = { ...getSettings(), baseUrl: 'https://api.openai.com/v1' };
  const model = configuredModel(configuration, input.apiKey, async (_url, options) => {
    const request = JSON.parse(options?.body ?? '{}');
    if ('thinking' in request) return { text: JSON.stringify({ error: { message: 'Unsupported parameter' } }), status: 400, ok: false };
    return { text: await completionResponse('Connected.').text(), status: 200, ok: true };
  });
  const { baseUrl, model: modelId, deepseekThinking } = configuration;
  await testConnection({ baseUrl, model: modelId, deepseekThinking, apiKey: input.apiKey }, { model });
  assert.equal(getState().digests.length, 0);
});
