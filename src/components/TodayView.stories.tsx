import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { Article, Digest, Feed } from '../../shared/types';
import type { ProviderConnection } from '../../shared/providers/schemas';
import type { Perform } from '../lib/client';
import { createAppState } from '../stories/fixtures';
import { TodayView } from './TodayView';

const date = '2026-09-10';
const createdAt = '2026-09-10T08:00:00.000Z';
const providerId = '11111111-1111-4111-8111-111111111111';
const modelId = '22222222-2222-4222-8222-222222222222';

const feed: Feed = {
  id: 'engineering',
  title: '工程周刊',
  url: 'https://engineering.example.com/feed.xml',
  siteUrl: 'https://engineering.example.com',
  category: '工程',
  createdAt,
  lastFetchedAt: createdAt,
  error: null,
  articleCount: 1,
};

const article: Article = {
  id: 'react-release',
  feedId: feed.id,
  feedTitle: feed.title,
  title: 'React 19 的可靠异步交互',
  url: 'https://engineering.example.com/react-19-actions',
  content: '用清晰的状态和可恢复路径，降低长任务带来的不确定感。',
  publishedAt: createdAt,
  dateEstimated: false,
};

const provider: ProviderConnection = {
  id: providerId,
  presetId: 'openai',
  name: 'OpenAI 工作连接',
  protocol: 'openai-responses',
  baseUrl: 'https://api.openai.com/v1',
  enabled: true,
  options: {
    timeoutMs: 120_000,
    maxOutputTokens: 6_000,
    reasoningEffort: 'medium',
    deepseekThinking: 'disabled',
  },
  revision: 1,
  createdAt,
  updatedAt: createdAt,
  hasCredential: true,
  checks: [],
  models: [
    {
      id: modelId,
      providerId,
      modelId: 'gpt-5.2',
      displayName: 'GPT-5.2',
      enabled: true,
      capabilities: { vision: true, reasoning: true, contextWindow: 400_000 },
      options: {},
      source: 'discovered',
      createdAt,
      updatedAt: createdAt,
    },
  ],
};

const digest: Digest = {
  id: 'daily-signal-2026-09-10',
  date,
  title: '异步交互正在成为 AI 产品的基础能力',
  markdown: '## 今日信号\n\n长任务需要稳定、诚实的状态反馈，并保留可以核查的原始来源。',
  createdAt: '2026-09-10T09:30:00.000Z',
  articleCount: 1,
  model: 'gpt-5.2',
  sources: [article],
  providerId,
  providerName: provider.name,
  providerProtocol: provider.protocol,
  providerModelId: modelId,
  providerOptions: provider.options,
};

const olderDigest: Digest = {
  ...digest,
  id: 'daily-signal-2026-09-10-older',
  title: '更早生成的日报版本',
  createdAt: '2026-09-10T08:30:00.000Z',
};

const readyState = createAppState({
  feeds: [feed],
  articles: [article],
  providers: [provider],
  defaultProviderModelId: modelId,
  hasApiKey: true,
});

const meta = {
  title: 'Views/TodayView',
  component: TodayView,
  args: {
    state: readyState,
    initialDate: date,
    busy: null,
    navigate: fn(),
    refresh: fn(),
    notify: fn(),
    generation: null,
    startGeneration: fn(async () => true),
    perform: fn<Perform>(async () => true),
  },
} satisfies Meta<typeof TodayView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToGenerate: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('heading', { level: 1, name: '把今天的文章，变成可追溯的洞见。' }),
    ).toBeVisible();
    await expect(canvas.getByRole('combobox', { name: '模型' })).toHaveValue(modelId);
    await expect(canvas.getByText('1 篇缓存文章')).toBeVisible();
    await expect(canvas.getByText('OpenAI 工作连接 · OpenAI Responses')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '生成日报' })).toBeEnabled();

    await userEvent.click(canvas.getByRole('button', { name: '查看生成流程与数据边界' }));
    await expect(canvas.getByText('按当前模板提炼主题、事实与脉络')).toBeVisible();
    await expect(canvas.getByText('成功后自动保存新版本和来源快照')).toBeVisible();
  },
};

export const Generating: Story = {
  args: {
    busy: '生成日报',
    generation: {
      sessionId: '33333333-3333-4333-8333-333333333333',
      events: [
        {
          id: 1,
          sessionId: '33333333-3333-4333-8333-333333333333',
          createdAt,
          type: 'queued',
        },
        {
          id: 2,
          sessionId: '33333333-3333-4333-8333-333333333333',
          createdAt,
          type: 'preparing',
          articleCount: 12,
          batchCount: 3,
        },
        {
          id: 3,
          sessionId: '33333333-3333-4333-8333-333333333333',
          createdAt,
          type: 'extracting',
          current: 2,
          total: 3,
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('已读取 12 篇文章，规划为 3 个批次')).toBeVisible();
    await expect(canvas.getByText(/这些状态来自本地 SQLite 事件队列。/)).toBeVisible();
    await expect(canvas.getByRole('button', { name: '正在生成' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '正在提取资料批次 2/3' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  },
};

export const GeneratedWithSources: Story = {
  args: { state: createAppState({ ...readyState, digests: [olderDigest, digest] }) },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { level: 2, name: '最新生成结果' })).toBeVisible();
    await expect(canvas.getByText('AI 生成 · 已归档')).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 2, name: digest.title })).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '查看 1 条参考来源' }));
    const source = canvas.getByRole('link', { name: article.title });
    await expect(source).toHaveAttribute('href', article.url);
    await expect(source).toHaveAttribute('target', '_blank');
    await expect(source).toHaveAttribute('rel', 'noopener noreferrer');
  },
};

export const NeedsSetup: Story = {
  args: { state: createAppState() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByText('尚未选择模型')).toBeVisible();
    await expect(canvas.getByText('生成前，请选择一个已启用的连接与模型。')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '生成日报' })).toBeDisabled();
  },
};
