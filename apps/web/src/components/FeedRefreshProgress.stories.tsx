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
    await expect(canvas.getByRole('status')).toHaveTextContent('抓取中 42/93');
    await expect(canvas.queryByRole('progressbar')).not.toBeInTheDocument();
  },
};

export const Completed: Story = {
  args: {
    value: {
      ...meta.args.value,
      status: 'completed',
      completed: 93,
      finishedAt: '2026-09-27T00:00:50Z',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('status')).not.toBeInTheDocument();
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const Interrupted: Story = {
  args: {
    value: {
      ...meta.args.value,
      status: 'failed',
      finishedAt: '2026-09-27T00:00:50Z',
      message: '后台抓取中断，已保存的订阅和文章仍保留，可重新刷新。',
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toHaveTextContent('抓取中断，请重试');
  },
};
