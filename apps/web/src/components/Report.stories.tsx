import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { curationSettingsSchema } from '@daily-signal/domain/curation';
import type { Digest } from '@daily-signal/domain';
import { Report } from './Report';

const quote = 'We measured a 20% reduction in allocations on the published benchmark workload.';
const digest: Digest = {
  id: 'curated-demo',
  date: '2026-09-26',
  title: '2026-09-26 精选日报',
  createdAt: '2026-09-26T08:00:00.000Z',
  markdown: '## Rust 内存分配实践\n\n基准中的分配次数下降 20%。',
  articleCount: 4,
  model: '测试模型',
  providerId: null,
  providerModelId: null,
  providerName: '本地预览',
  providerProtocol: null,
  providerOptions: null,
  sources: [
    {
      id: 'source-1',
      feedId: 'feed',
      feedTitle: '工程周刊',
      title: 'Allocation benchmark',
      url: 'https://example.com/benchmark',
      content: quote,
      publishedAt: '2026-09-26T02:00:00.000Z',
      dateEstimated: false,
    },
  ],
  curation: {
    version: 1,
    settings: curationSettingsSchema.parse({ tags: ['Rust', '数据库'] }),
    cards: [
      {
        id: 'event-1',
        title: 'Rust 内存分配实践：减少重复创建临时对象',
        summary:
          '作者在公开工作负载中测得分配次数下降 20%，并提供了复现步骤；该结果不代表所有应用都有相同收益。',
        impact: '如果服务在分配上消耗明显，可先用自己的工作负载验证。',
        category: 'engineering',
        tags: ['Rust'],
        score: 8.6,
        sourceIds: ['source-1'],
        evidence: [{ sourceId: 'source-1', quote }],
      },
    ],
    documents: [{ sourceId: 'source-1', content: quote, kind: 'feed', status: 'unavailable' }],
    stats: {
      inputCount: 5,
      uniqueCount: 4,
      cachedCount: 2,
      eligibleCount: 3,
      candidateCount: 3,
      eventCount: 2,
      selectedCount: 1,
      fullTextCount: 0,
      modelCalls: 3,
      inputTokens: 2300,
      outputTokens: 800,
      durationMs: 24000,
    },
  },
};
const meta = {
  title: 'Views/Report',
  component: Report,
  args: { digest },
  render: (args) => (
    <div className="mx-auto max-w-4xl p-4">
      <h1 className="sr-only">日报阅读</h1>
      <Report {...args} />
    </div>
  ),
} satisfies Meta<typeof Report>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Curated: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('heading', { name: /Rust 内存分配实践/, level: 3 }),
    ).toBeVisible();
    await expect(canvas.getByText(quote, { exact: true })).not.toBeVisible();
    await userEvent.click(canvas.getByText('原文依据（1）'));
    await expect(canvas.getByText(quote, { exact: true })).toBeVisible();
    await expect(canvas.getByRole('link', { name: '工程周刊' })).toHaveAttribute(
      'href',
      'https://example.com/benchmark',
    );
    await expect(canvas.getByText('1 个来源 · 订阅摘要')).toBeVisible();
    await userEvent.click(canvas.getByText('生成记录'));
    await expect(canvas.getByText('2300 / 800')).toBeVisible();
  },
};
export const NoMatches: Story = {
  args: {
    digest: {
      ...digest,
      curation: {
        ...digest.curation!,
        cards: [],
        documents: [],
        stats: { ...digest.curation!.stats, selectedCount: 0 },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/本次没有符合兴趣标签/)).toBeVisible();
    await expect(canvas.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  },
};
