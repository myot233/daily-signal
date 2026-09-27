import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FeedRefreshProgress } from './FeedRefreshProgress';

const meta = {
  title: 'Views/FeedRefreshProgress',
  component: FeedRefreshProgress,
  args: {
    value: {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'running',
      total: 93,
      completed: 42,
      added: 1860,
      errors: [],
      startedAt: '2026-09-27T00:00:00Z',
      finishedAt: null,
      message: null,
    },
  },
} satisfies Meta<typeof FeedRefreshProgress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('progressbar')).toHaveAttribute('value', '42');
    await expect(canvas.getByRole('status')).toHaveTextContent('42 / 93');
    await expect(canvas.getByRole('status')).toHaveTextContent('后台抓取文章');
  },
};

export const CompletedWithFailures: Story = {
  args: {
    value: {
      ...meta.args.value,
      status: 'completed',
      completed: 93,
      finishedAt: '2026-09-27T00:00:50Z',
      errors: [{ url: 'https://example.com/feed', error: '订阅服务器返回 HTTP 503，请稍后重试。' }],
    },
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument();
    await expect(canvas.getByRole('status')).toHaveTextContent('抓取完成');
    await expect(canvas.getByText(/订阅服务器返回 HTTP 503/)).not.toBeVisible();
    await userEvent.click(canvas.getByText('失败详情（1）'));
    await expect(canvas.getByText(/订阅服务器返回 HTTP 503/)).toBeVisible();
  },
};
