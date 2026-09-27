import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateBenchmarkResult } from './recall-runner';
import { scoreRecall } from './recall';

test('benchmark uses the real digest pipeline with an isolated database and no labels in prompts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'rss-recall-'));
  const unusedDatabase = join(directory, 'must-not-be-created.sqlite');
  process.env.DATABASE_PATH = unusedDatabase;
  let screenings = 0;
  const selected = new Set(['r01', 'r03', 'r04', 'r06', 'r08', 'r09', 'r10', 'r13', 'r15']);
  const apiKey = 'benchmark-test-key-never-persist';
  const model = createOpenAICompatible({
    name: 'benchmark-test',
    baseURL: 'https://model.example.com/v1',
    apiKey,
    fetch: async (_url, init) => {
      const request = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      const prompt = request.messages.find((message) => message.role === 'user')!.content;
      assert.doesNotMatch(prompt, /"relevant"|"expectedEventCount"|"benchmarkId"/);
      const payload = JSON.parse(prompt) as {
        tags?: string[];
        articles?: Array<{ id: string }>;
        sources?: Array<{ sourceId: string; content: string }>;
      };
      let response: unknown;
      if (payload.tags && payload.articles) {
        screenings += payload.articles.length;
        response = {
          items: payload.articles.map(({ id }) => ({
            id,
            category: 'engineering',
            kind: 'engineering',
            matchedTags: selected.has(id) ? ['软件工程'] : [],
            relevance: selected.has(id) ? 9 : 2,
            quality: 8,
            reason: '隔离测试的确定性响应。',
          })),
        };
      } else if (payload.articles) {
        response = {
          groups: [
            ['r01', 'r09'],
            ...payload.articles
              .filter(({ id }) => !['r01', 'r09'].includes(id))
              .map(({ id }) => [id]),
          ],
        };
      } else {
        const source = payload.sources![0]!;
        response = {
          title: '测试卡片',
          summary: source.content.slice(0, 100),
          impact: '',
          evidence: [{ sourceId: source.sourceId, quote: source.content.slice(0, 60) }],
        };
      }
      return Response.json({
        id: 'benchmark-test',
        object: 'chat.completion',
        created: 1,
        model: 'benchmark-test',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: JSON.stringify(response) },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
      });
    },
  }).chatModel('benchmark-test');
  try {
    const result = await generateBenchmarkResult(
      {
        baseUrl: 'https://model.example.com/v1',
        model: 'benchmark-test',
        apiKey,
        deepseekThinking: 'disabled',
      },
      { model },
    );
    assert.equal(screenings, 15);
    assert.equal(result.curation!.stats.inputCount, 16);
    assert.equal(result.curation!.stats.cachedCount, 0);
    assert.equal(result.curation!.stats.modelCalls, 11);
    assert.equal(result.curation!.cards.length, 8);
    assert.equal(scoreRecall(result).recall, 1);
    assert.equal(scoreRecall(result).precision, 1);
    assert.equal(JSON.stringify(result).includes(apiKey), false);
    assert.equal(existsSync(unusedDatabase), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
