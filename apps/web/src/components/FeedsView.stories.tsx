import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import type { Feed } from '@daily-signal/domain';
import { feedIconQueryOptions } from '@daily-signal/client/query';
import { createAppState } from '../stories/fixtures';
import { FeedsView } from './FeedsView';

const date = '2026-09-27T08:00:00.000Z';
const feeds: Feed[] = ['工程周刊', '设计观察', '等待更新的订阅'].map((title, index) => ({
  id: `feed-${index}`,
  title,
  url: `https://example.com/feed-${index}.xml`,
  siteUrl: window.location.origin,
  category: index ? '设计' : '工程',
  articleCount: index === 2 ? 0 : 1,
  createdAt: date,
  lastFetchedAt: index === 2 ? null : date,
  error: index === 2 ? '订阅源暂时不可用' : null,
}));
const articles = feeds.slice(0, 2).map((feed, index) => ({
  id: `article-${index}`,
  feedId: feed.id,
  feedTitle: feed.title,
  title: index ? '设计系统中的阅读体验' : '可靠的工程实践',
  url: `https://example.com/articles/${index}`,
  content: index ? '阅读体验来自清晰的层次和连续的上下文。' : '使用交互测试验证用户行为。',
  publishedAt: date,
  dateEstimated: false,
}));

const meta = {
  title: 'Views/Subscriptions',
  component: FeedsView,
  decorators: [
    function WithQueryClient(Story) {
      const [client] = useState(() => {
        const queryClient = new QueryClient();
        for (const feed of feeds)
          queryClient.setQueryData(feedIconQueryOptions(feed).queryKey, null);
        return queryClient;
      });
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  args: {
    state: createAppState({ feeds, articles }),
    busy: null,
    navigate: fn(),
    refresh: fn(),
    notify: fn(),
    perform: fn(async () => {
      throw new Error('此场景不应提交订阅变更');
    }),
  },
} satisfies Meta<typeof FeedsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Refreshing: Story = {
  args: {
    feedRefresh: {
      id: '00000000-0000-4000-8000-000000000001',
      status: 'running',
      total: 93,
      completed: 42,
      added: 1860,
      errors: [],
      startedAt: date,
      finishedAt: null,
      message: null,
    },
    refreshing: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const status = canvas.getByRole('status');
    await expect(status).toHaveTextContent('抓取中 42/93');
    await expect(status.closest('.view-heading')).not.toBeNull();
  },
};

export const SelectAndRead: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const sources = within(canvas.getByRole('complementary', { name: '订阅源列表' }));
    const search = canvas.getByRole('textbox', { name: '搜索文章' });
    await expect(canvas.getByText('2 篇')).toBeVisible();
    await userEvent.click(sources.getByRole('button', { name: '工程周刊' }));
    await expect(canvas.getByRole('button', { name: articles[0].title })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: articles[1].title })).not.toBeInTheDocument();
    await expect(canvas.getByText(feeds[0].url)).not.toBeVisible();
    await userEvent.click(canvas.getByText('订阅详情'));
    await expect(canvas.getByRole('link', { name: feeds[0].url })).toBeVisible();
    await userEvent.click(canvas.getByText('订阅详情'));
    await userEvent.click(canvas.getByRole('button', { name: articles[0].title }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog');
    const reader = within(dialog);
    await expect(reader.getByText(articles[0].content)).toBeVisible();
    await expect(reader.getByRole('button', { name: '下一篇' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await expect(canvas.getByRole('button', { name: articles[0].title })).toHaveFocus();
    await userEvent.type(search, '阅读');
    await expect(canvas.getByText('0 篇')).toBeVisible();
    await userEvent.click(sources.getByRole('button', { name: '设计观察' }));
    await expect(search).toHaveValue('阅读');
    await expect(canvas.getByRole('button', { name: articles[1].title })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: articles[0].title })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: '清除筛选' }));
    await expect(sources.getByRole('button', { name: /全部文章/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(search).toHaveValue('');
    await expect(canvas.getByText('2 篇')).toBeVisible();
    await userEvent.click(sources.getByRole('button', { name: '等待更新的订阅' }));
    await expect(canvas.getByText('刷新失败：订阅源暂时不可用')).toBeVisible();
    await expect(canvas.getByText('0 篇')).toBeVisible();
    await userEvent.click(sources.getByRole('button', { name: '删除 等待更新的订阅' }));
    const confirmation = await within(canvasElement.ownerDocument.body).findByRole('dialog', {
      name: '删除这个订阅源？',
    });
    await userEvent.click(within(confirmation).getByRole('button', { name: '保留订阅' }));
    await waitFor(() => expect(confirmation).not.toBeInTheDocument());
    await expect(sources.getByRole('button', { name: '等待更新的订阅' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

export const RemovedSelection: Story = {
  render: function UpdatingSubscriptions(args) {
    const [state, setState] = useState(args.state);
    return (
      <>
        <button
          type="button"
          onClick={() =>
            setState((current) => ({
              ...current,
              feeds: current.feeds.filter((feed) => feed.id !== feeds[0].id),
              articles: current.articles.filter((article) => article.feedId !== feeds[0].id),
            }))
          }
        >
          模拟订阅数据更新
        </button>
        <FeedsView {...args} state={state} />
      </>
    );
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const sources = within(canvas.getByRole('complementary', { name: '订阅源列表' }));
    await userEvent.click(sources.getByRole('button', { name: '工程周刊' }));
    await userEvent.click(canvas.getByRole('button', { name: '模拟订阅数据更新' }));
    await expect(sources.queryByRole('button', { name: '工程周刊' })).not.toBeInTheDocument();
    await expect(sources.getByRole('button', { name: /全部文章/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.getByRole('heading', { level: 2, name: '全部文章' })).toBeVisible();
    await expect(canvas.getByRole('button', { name: articles[1].title })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: articles[0].title })).not.toBeInTheDocument();
  },
};
