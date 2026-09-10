import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { APICallError, generateText } from 'ai';
import { providerOptionsSchema } from '../../../shared/providers/schemas';
import { shouldDiscardProviderDraft } from '../../../shared/providers/draft-state';
import type { ProviderProtocol } from '../../../shared/providers/catalog';

// Test-only loading boundary: select isolated storage before importing database consumers.
process.env.DATABASE_PATH = ':memory:';
const { db } = await import('../../infrastructure/database/client');
const { providerChecks, providerCredentials, providerModels, providers, settings } =
  await import('../../infrastructure/database/schema');
const { createRuntimeModel } = await import('./adapters');
const {
  createProvider,
  getProviderCredential,
  listProviders,
  removeProvider,
  resolveProviderSnapshot,
  saveProviderModel,
  setDefaultProviderModel,
  updateProvider,
} = await import('./repository');
const { discoverModels } = await import('./discovery');
const { testSavedProviderConnection } = await import('../ai/service');

const defaultOptions = providerOptionsSchema.parse({});
const chatResponse = JSON.stringify({
  id: 'chat',
  object: 'chat.completion',
  created: 1,
  model: 'test-model',
  choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});
const responsesResponse = JSON.stringify({
  id: 'resp',
  object: 'response',
  created_at: 1,
  status: 'completed',
  model: 'test-model',
  output: [
    {
      type: 'message',
      id: 'msg',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'OK', annotations: [] }],
    },
  ],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
});
const anthropicResponse = JSON.stringify({
  id: 'msg',
  type: 'message',
  role: 'assistant',
  model: 'test-model',
  content: [{ type: 'text', text: 'OK' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});
const geminiResponse = JSON.stringify({
  candidates: [
    { content: { role: 'model', parts: [{ text: 'OK' }] }, finishReason: 'STOP', index: 0 },
  ],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
});

beforeEach(() => {
  db.update(settings).set({ defaultProviderModelId: null }).run();
  db.delete(providerChecks).run();
  db.delete(providerCredentials).run();
  db.delete(providerModels).run();
  db.delete(providers).run();
});

async function captureProtocol(
  protocol: ProviderProtocol,
  options = defaultOptions,
  presetId = 'custom',
) {
  let request: { url: string; headers: Headers; body: Record<string, unknown> } | undefined;
  const response =
    protocol === 'openai-responses'
      ? responsesResponse
      : protocol === 'anthropic-messages'
        ? anthropicResponse
        : protocol === 'gemini-generative-language'
          ? geminiResponse
          : chatResponse;
  const runtime = createRuntimeModel(
    {
      protocol,
      presetId,
      baseUrl: 'https://provider.example.com/v1',
      modelId: protocol === 'openai-responses' ? 'gpt-5' : 'test-model',
      apiKey: 'PROTOCOL-KEY',
      options,
    },
    async (url, init) => {
      request = { url, headers: new Headers(init?.headers), body: JSON.parse(init?.body ?? '{}') };
      return { text: response, status: 200, ok: true };
    },
  );
  const result = await generateText({
    model: runtime.model,
    prompt: 'Reply OK.',
    maxOutputTokens: runtime.maxOutputTokens,
    maxRetries: 0,
    providerOptions: runtime.providerOptions,
  });
  assert.equal(result.text, 'OK');
  assert.ok(request);
  return request;
}

function updateInput(
  provider: ReturnType<typeof createProvider>,
  changes: Partial<Parameters<typeof updateProvider>[0]> = {},
): Parameters<typeof updateProvider>[0] {
  return {
    id: provider.id,
    revision: provider.revision,
    presetId: provider.presetId,
    name: provider.name,
    protocol: provider.protocol,
    baseUrl: provider.baseUrl,
    enabled: provider.enabled,
    options: provider.options,
    ...changes,
  };
}

test('four protocol adapters use isolated native paths, authentication and parameter mappings', async () => {
  const responses = await captureProtocol(
    'openai-responses',
    providerOptionsSchema.parse({ reasoningEffort: 'xhigh' }),
  );
  assert.match(responses.url, /\/v1\/responses$/);
  assert.equal(responses.headers.get('authorization'), 'Bearer PROTOCOL-KEY');
  assert.equal(
    responses.body.reasoning && (responses.body.reasoning as Record<string, unknown>).effort,
    'xhigh',
  );

  const chat = await captureProtocol(
    'openai-chat-completions',
    providerOptionsSchema.parse({ reasoningEffort: 'none', deepseekThinking: 'disabled' }),
    'deepseek',
  );
  assert.match(chat.url, /\/v1\/chat\/completions$/);
  assert.equal(chat.headers.get('authorization'), 'Bearer PROTOCOL-KEY');
  assert.equal(chat.body.reasoning_effort, 'none');
  assert.deepEqual(chat.body.thinking, { type: 'disabled' });

  const ordinaryChat = await captureProtocol('openai-chat-completions');
  assert.equal('thinking' in ordinaryChat.body, false);

  const anthropic = await captureProtocol(
    'anthropic-messages',
    providerOptionsSchema.parse({ maxOutputTokens: 4_096, anthropicThinkingBudget: 2_048 }),
  );
  assert.match(anthropic.url, /\/v1\/messages$/);
  assert.equal(anthropic.headers.get('x-api-key'), 'PROTOCOL-KEY');
  assert.deepEqual(anthropic.body.thinking, { type: 'enabled', budget_tokens: 2_048 });

  const gemini = await captureProtocol(
    'gemini-generative-language',
    providerOptionsSchema.parse({ geminiThinkingBudget: 1_024 }),
  );
  assert.match(gemini.url, /\/v1\/models\/test-model:generateContent$/);
  assert.equal(gemini.headers.get('x-goog-api-key'), 'PROTOCOL-KEY');
  const generationConfig = gemini.body.generationConfig as Record<string, unknown>;
  assert.deepEqual(generationConfig.thinkingConfig, { thinkingBudget: 1_024 });
});

test('provider CRUD isolates credentials, keeps public responses clean and enforces explicit default changes', () => {
  const first = createProvider({
    presetId: 'openai',
    name: 'Work',
    protocol: 'openai-responses',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    credential: 'WORK-SECRET',
    initialModelId: 'gpt-work',
    options: defaultOptions,
  });
  const second = createProvider({
    presetId: 'openai',
    name: 'Personal',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://api.openai.com/v1',
    enabled: true,
    credential: 'PERSONAL-SECRET',
    initialModelId: 'gpt-personal',
    options: defaultOptions,
  });
  assert.equal(getProviderCredential(first.id), 'WORK-SECRET');
  assert.equal(getProviderCredential(second.id), 'PERSONAL-SECRET');
  const listed = listProviders();
  assert.equal(JSON.stringify(listed).includes('SECRET'), false);
  assert.deepEqual(
    listed.find((provider) => provider.id === first.id)?.models.map((model) => model.modelId),
    ['gpt-work'],
  );
  assert.deepEqual(
    listed.find((provider) => provider.id === second.id)?.models.map((model) => model.modelId),
    ['gpt-personal'],
  );
  setDefaultProviderModel(first.models[0]!.id);
  assert.throws(
    () => updateProvider(updateInput(first, { enabled: false, credential: undefined })),
    /默认连接/,
  );
  assert.throws(() => removeProvider(first.id, first.revision), /默认连接/);
  assert.throws(
    () =>
      saveProviderModel({
        providerId: first.id,
        modelId: 'gpt-work',
        displayName: null,
        enabled: false,
        source: 'manual',
      }),
    /默认模型/,
  );
  setDefaultProviderModel(null);
  removeProvider(first.id, first.revision);
  assert.equal(listProviders().length, 1);
});

test('model discovery is bounded, credentialed, redirect-disabled and never mutates saved models', async () => {
  const provider = createProvider({
    presetId: 'gemini',
    name: 'Gemini',
    protocol: 'gemini-generative-language',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    enabled: true,
    credential: 'GEMINI-SECRET',
    initialModelId: 'manual-model',
    options: defaultOptions,
  });
  let seen: { url: string; headers: Headers; redirect?: string; maxBytes?: number } | undefined;
  const result = await discoverModels(provider.id, async (url, init) => {
    seen = {
      url,
      headers: new Headers(init?.headers),
      redirect: init?.redirect,
      maxBytes: init?.maxBytes,
    };
    return {
      status: 200,
      ok: true,
      text: JSON.stringify({
        models: [
          {
            name: 'models/gemini-z',
            displayName: 'Gemini Z',
            supportedGenerationMethods: ['generateContent'],
          },
          { name: 'models/embed', supportedGenerationMethods: ['embedContent'] },
          { name: 'models/gemini-z', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
    };
  });
  assert.deepEqual(result.models, [{ modelId: 'gemini-z', displayName: 'Gemini Z' }]);
  assert.match(seen!.url, /\/v1beta\/models$/);
  assert.equal(seen!.headers.get('x-goog-api-key'), 'GEMINI-SECRET');
  assert.equal(seen!.headers.get('authorization'), null);
  assert.equal(seen!.redirect, 'error');
  assert.equal(seen!.maxBytes, 512 * 1024);
  assert.deepEqual(
    listProviders()[0]!.models.map((model) => model.modelId),
    ['manual-model'],
  );
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('in-flight checks keep their starting revision and deletion cannot hide the result', async () => {
  const provider = createProvider({
    presetId: 'custom',
    name: 'Gateway',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://gateway.example.com/v1',
    enabled: true,
    credential: 'KEY',
    initialModelId: 'model',
    options: defaultOptions,
  });
  const started = deferred<void>();
  const release = deferred<void>();
  const pending = testSavedProviderConnection(provider.id, 'model', {
    transport: async () => {
      started.resolve();
      await release.promise;
      return { text: chatResponse, status: 200, ok: true };
    },
  });
  await started.promise;
  updateProvider(updateInput(provider, { name: 'Gateway renamed', credential: undefined }));
  release.resolve();
  const result = await pending;
  assert.ok(result.checks.every((check) => check.configRevision === provider.revision));
  assert.ok(
    listProviders()[0]!.checks.every((check) => check.configRevision === provider.revision),
  );
  assert.ok(
    listProviders()[0]!.checks.every(
      (check) => check.configRevision !== listProviders()[0]!.revision,
    ),
  );

  const current = listProviders()[0]!;
  const startedAgain = deferred<void>();
  const releaseAgain = deferred<void>();
  const deletedPending = testSavedProviderConnection(current.id, 'model', {
    transport: async () => {
      startedAgain.resolve();
      await releaseAgain.promise;
      return { text: chatResponse, status: 200, ok: true };
    },
  });
  await startedAgain.promise;
  removeProvider(current.id, current.revision);
  releaseAgain.resolve();
  const deletedResult = await deletedPending;
  assert.equal(deletedResult.checks.length, 3);
  assert.equal(listProviders().length, 0);
});

test('aborted connection tests record endpoint failure without claiming authentication', async () => {
  const provider = createProvider({
    presetId: 'custom',
    name: 'Gateway',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://gateway.example.com/v1',
    enabled: true,
    credential: 'KEY',
    initialModelId: 'model',
    options: defaultOptions,
  });
  const result = await testSavedProviderConnection(provider.id, 'model', {
    signal: AbortSignal.abort(),
  });
  assert.equal(result.checks.find((check) => check.stage === 'endpoint')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.stage === 'authentication')?.status, 'skipped');
});

test('protocol changes clear credentials unless a replacement is explicit, and revision conflicts do not overwrite', () => {
  const provider = createProvider({
    presetId: 'custom',
    name: 'Gateway',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://gateway.example.com/v1',
    enabled: true,
    credential: 'OLD',
    options: defaultOptions,
  });
  const changed = updateProvider(
    updateInput(provider, { protocol: 'anthropic-messages', credential: undefined }),
  );
  assert.equal(getProviderCredential(provider.id), null);
  assert.throws(
    () => updateProvider(updateInput(provider, { name: 'stale write', credential: 'LEAK' })),
    /其他页面修改/,
  );
  assert.equal(getProviderCredential(provider.id), null);
  updateProvider(updateInput(changed, { credential: 'NEW' }));
  assert.equal(getProviderCredential(provider.id), 'NEW');
  assert.equal(db.select().from(settings).get()?.apiKey, null);
});

test('resolved generation snapshots remain unchanged after provider edits and deletion', () => {
  const provider = createProvider({
    presetId: 'custom',
    name: 'Snapshot source',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://snapshot.example.com/v1',
    enabled: true,
    credential: 'SNAPSHOT-KEY',
    initialModelId: 'snapshot-model',
    options: defaultOptions,
  });
  setDefaultProviderModel(provider.models[0]!.id);
  const snapshot = resolveProviderSnapshot();
  const changed = updateProvider(
    updateInput(provider, { name: 'Changed later', credential: 'NEW-KEY' }),
  );
  setDefaultProviderModel(null);
  removeProvider(changed.id, changed.revision);
  assert.equal(snapshot.provider.name, 'Snapshot source');
  assert.equal(snapshot.model.modelId, 'snapshot-model');
  assert.equal(snapshot.apiKey, 'SNAPSHOT-KEY');
});

test('connection tests keep full output budget for every configured reasoning mode', async () => {
  const cases: Array<{
    protocol: ProviderProtocol;
    presetId: string;
    modelId: string;
    options: ReturnType<typeof providerOptionsSchema.parse>;
    response: string;
    readBudget: (body: Record<string, unknown>) => number | undefined;
  }> = [
    {
      protocol: 'openai-responses',
      presetId: 'openai',
      modelId: 'gpt-5',
      options: providerOptionsSchema.parse({ maxOutputTokens: 4_096, reasoningEffort: 'high' }),
      response: responsesResponse,
      readBudget: (body) => body.max_output_tokens as number,
    },
    {
      protocol: 'openai-chat-completions',
      presetId: 'custom',
      modelId: 'reasoning-model',
      options: providerOptionsSchema.parse({ maxOutputTokens: 4_096, reasoningEffort: 'high' }),
      response: chatResponse,
      readBudget: (body) => body.max_tokens as number,
    },
    {
      protocol: 'openai-chat-completions',
      presetId: 'deepseek',
      modelId: 'deepseek-reasoner',
      options: providerOptionsSchema.parse({
        maxOutputTokens: 16_384,
        deepseekThinking: 'enabled',
      }),
      response: chatResponse,
      readBudget: (body) => body.max_tokens as number,
    },
    {
      protocol: 'anthropic-messages',
      presetId: 'anthropic',
      modelId: 'claude-test',
      options: providerOptionsSchema.parse({
        maxOutputTokens: 4_096,
        anthropicThinkingBudget: 2_048,
      }),
      response: anthropicResponse,
      readBudget: (body) => body.max_tokens as number,
    },
    {
      protocol: 'gemini-generative-language',
      presetId: 'gemini',
      modelId: 'gemini-test',
      options: providerOptionsSchema.parse({ maxOutputTokens: 4_096, geminiThinkingBudget: 1_024 }),
      response: geminiResponse,
      readBudget: (body) =>
        (body.generationConfig as Record<string, unknown>).maxOutputTokens as number,
    },
  ];
  for (const item of cases) {
    const provider = createProvider({
      presetId: item.presetId,
      name: item.protocol,
      protocol: item.protocol,
      baseUrl: `https://${item.presetId}.example.com/v1`,
      enabled: true,
      credential: 'KEY',
      initialModelId: item.modelId,
      options: item.options,
    });
    let budget: number | undefined;
    const result = await testSavedProviderConnection(provider.id, item.modelId, {
      transport: async (_url, init) => {
        budget = item.readBudget(JSON.parse(init?.body ?? '{}'));
        return { text: item.response, status: 200, ok: true };
      },
    });
    assert.equal(result.checks.find((check) => check.stage === 'model')?.status, 'passed');
    assert.equal(budget, item.options.maxOutputTokens);
  }
});

test('Anthropic thinking reserves answer tokens inside the configured total output budget', () => {
  assert.equal(
    providerOptionsSchema.safeParse({ maxOutputTokens: 1_055, anthropicThinkingBudget: 1_024 })
      .success,
    false,
  );
  assert.equal(
    providerOptionsSchema.safeParse({ maxOutputTokens: 1_056, anthropicThinkingBudget: 1_024 })
      .success,
    true,
  );
});

test('unknown connection failures cannot be reported as a successful model check', async () => {
  const provider = createProvider({
    presetId: 'custom',
    name: 'Broken transport',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://broken.example.com/v1',
    enabled: true,
    credential: 'KEY',
    initialModelId: 'broken-model',
    options: defaultOptions,
  });
  const result = await testSavedProviderConnection(provider.id, 'broken-model', {
    transport: async () => {
      throw new Error('secret transport detail');
    },
  });
  assert.equal(result.checks.find((check) => check.stage === 'endpoint')?.status, 'skipped');
  assert.equal(result.checks.find((check) => check.stage === 'authentication')?.status, 'skipped');
  const model = result.checks.find((check) => check.stage === 'model');
  assert.equal(model?.status, 'failed');
  assert.doesNotMatch(model?.safeError ?? '', /secret transport detail/);

  const noResponse = await testSavedProviderConnection(provider.id, 'broken-model', {
    transport: async () => {
      throw new APICallError({
        message: 'private network failure',
        url: provider.baseUrl,
        requestBodyValues: {},
      });
    },
  });
  assert.equal(noResponse.checks.find((check) => check.stage === 'endpoint')?.status, 'skipped');
  assert.equal(noResponse.checks.find((check) => check.stage === 'model')?.status, 'failed');
  assert.doesNotMatch(JSON.stringify(noResponse), /private network failure/);

  const malformed = createProvider({
    presetId: 'custom',
    name: 'Malformed response',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://malformed.example.com/v1',
    enabled: true,
    credential: 'KEY',
    initialModelId: 'broken-model',
    options: defaultOptions,
  });
  const malformedResult = await testSavedProviderConnection(malformed.id, 'broken-model', {
    transport: async () => ({ text: '{"choices":', status: 200, ok: true }),
  });
  const malformedModel = malformedResult.checks.find((check) => check.stage === 'model');
  assert.equal(malformedModel?.status, 'failed');
  assert.ok(malformedModel?.safeError);
});

test('provider drafts survive edits on the settings fallback and clear after successful navigation', () => {
  assert.equal(
    shouldDiscardProviderDraft({
      draftProviderId: 'provider-a',
      selectedProviderId: 'provider-a',
      previousLocationKey: 'same',
      currentLocationKey: 'same',
    }),
    false,
  );
  assert.equal(
    shouldDiscardProviderDraft({
      draftProviderId: 'provider-a',
      selectedProviderId: 'provider-a',
      previousLocationKey: 'before',
      currentLocationKey: 'after',
    }),
    true,
  );
  assert.equal(
    shouldDiscardProviderDraft({
      draftProviderId: 'provider-a',
      selectedProviderId: 'provider-b',
      previousLocationKey: 'same',
      currentLocationKey: 'same',
    }),
    true,
  );
});

test('connection probes ignore inactive and foreign reasoning options while respecting small ceilings', async () => {
  const cases = [
    {
      protocol: 'openai-responses',
      presetId: 'openai',
      options: { reasoningEffort: 'none', deepseekThinking: 'enabled' },
      response: responsesResponse,
      budgetKey: 'max_output_tokens',
    },
    {
      protocol: 'openai-chat-completions',
      presetId: 'custom',
      options: { deepseekThinking: 'enabled' },
      response: chatResponse,
      budgetKey: 'max_tokens',
    },
    {
      protocol: 'anthropic-messages',
      presetId: 'anthropic',
      options: { reasoningEffort: 'high' },
      response: anthropicResponse,
      budgetKey: 'max_tokens',
    },
    {
      protocol: 'gemini-generative-language',
      presetId: 'gemini',
      options: { geminiThinkingBudget: 0, reasoningEffort: 'high' },
      response: geminiResponse,
      budgetKey: 'maxOutputTokens',
    },
    {
      protocol: 'openai-chat-completions',
      presetId: 'deepseek',
      options: { maxOutputTokens: 64, deepseekThinking: 'disabled', reasoningEffort: 'none' },
      response: chatResponse,
      budgetKey: 'max_tokens',
    },
  ] as const;

  for (const item of cases) {
    const options = providerOptionsSchema.parse({ maxOutputTokens: 4_096, ...item.options });
    const provider = createProvider({
      presetId: item.presetId,
      name: item.protocol,
      protocol: item.protocol,
      baseUrl: `https://${item.presetId}.example.com/v1`,
      enabled: true,
      credential: 'KEY',
      initialModelId: 'test-model',
      options,
    });
    let requestBudget: number | undefined;
    const result = await testSavedProviderConnection(provider.id, 'test-model', {
      transport: async (_url, init) => {
        const body = JSON.parse(init?.body ?? '{}');
        requestBudget = (body.generationConfig ?? body)[item.budgetKey];
        return { text: item.response, status: 200, ok: true };
      },
    });
    assert.equal(result.checks.find((check) => check.stage === 'model')?.status, 'passed');
    assert.equal(requestBudget, Math.min(128, options.maxOutputTokens), item.protocol);
  }
});

test('provider HTTP failures record the right failed stage without leaking upstream details', async () => {
  const provider = createProvider({
    presetId: 'custom',
    name: 'Error classification',
    protocol: 'openai-chat-completions',
    baseUrl: 'https://errors.example.com/v1',
    enabled: true,
    credential: 'KEY',
    initialModelId: 'test-model',
    options: defaultOptions,
  });
  for (const [status, failedStage] of [
    [401, 'authentication'],
    [403, 'authentication'],
    [404, 'endpoint'],
    [429, 'model'],
    [500, 'model'],
  ] as const) {
    const result = await testSavedProviderConnection(provider.id, 'test-model', {
      transport: async () => ({
        text: JSON.stringify({ error: { message: 'UPSTREAM-SECRET', type: 'provider_error' } }),
        status,
        ok: false,
      }),
    });
    assert.deepEqual(
      result.checks.filter((check) => check.status === 'failed').map((check) => check.stage),
      [failedStage],
    );
    assert.doesNotMatch(JSON.stringify(result), /UPSTREAM-SECRET/);
  }
});
