import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import {
  appStateQueryOptions,
  feedIconQueryOptions,
  feedRefreshQueryOptions,
} from '@daily-signal/client/query';
import { providerConnectionSchema } from '@daily-signal/domain/providers/schemas';
import type { AppState } from '@daily-signal/domain';
import { createAppState } from './stories/fixtures';
import App from './App';

const createdAt = '2026-09-27T08:00:00.000Z';
const feed = {
  id: 'layout-feed',
  title: '工程实践与开源工具：一份较长名称的技术订阅',
  url: 'https://example.com/feed.xml',
  siteUrl: window.location.origin,
  category: '工程实践',
  createdAt,
  lastFetchedAt: createdAt,
  error: null,
  articleCount: 3,
};
const articles = Array.from({ length: 3 }, (_, index) => ({
  id: `layout-article-${index}`,
  feedId: feed.id,
  feedTitle: feed.title,
  title: `布局检查 ${index + 1}：在不同屏幕尺寸下保持可读的内容与合理的操作间距`,
  url: `https://example.com/articles/${index}`,
  content: '检查长标题、中文正文、按钮与面板的边界。'.repeat(12),
  publishedAt: createdAt,
  dateEstimated: false,
}));
const populated = createAppState({
  providers: [
    providerConnectionSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      presetId: 'openai',
      name: '工程团队的模型连接',
      protocol: 'openai-responses',
      baseUrl: 'https://api.example.com/v1',
      enabled: true,
      options: {},
      revision: 1,
      createdAt,
      updatedAt: createdAt,
      hasCredential: false,
      checks: [],
      models: [],
    }),
  ],
  feeds: [feed],
  articles,
  digests: [
    {
      id: 'layout-digest',
      date: '2026-09-27',
      createdAt,
      title: '工程实践日报：较长的标题应当换行并保留操作空间',
      markdown: '## 今日重点\n\n正文应该保持可读的行宽与合理的留白。',
      articleCount: articles.length,
      model: 'fixture',
      sources: articles,
      providerId: null,
      providerName: null,
      providerProtocol: null,
      providerModelId: null,
      providerOptions: null,
    },
  ],
});

function AppFixture({
  path,
  empty,
  state: fixtureState,
}: {
  path: string;
  empty: boolean;
  state?: AppState;
}) {
  const [client] = useState(() => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
      },
    });
    // Seed the real query boundary. No HTTP server, credentials or model calls.
    const state = fixtureState ?? (empty ? createAppState() : populated);
    queryClient.setQueryDefaults(appStateQueryOptions.queryKey, {
      queryFn: () => state,
      staleTime: Infinity,
    });
    queryClient.setQueryData(appStateQueryOptions.queryKey, state);
    queryClient.setQueryDefaults(feedRefreshQueryOptions.queryKey, { staleTime: Infinity });
    queryClient.setQueryData(feedRefreshQueryOptions.queryKey, null);
    queryClient.setQueryData(feedIconQueryOptions(feed).queryKey, null);
    return queryClient;
  });
  const [router] = useState(() =>
    createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: [path] }),
  );
  return (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

const meta = {
  title: 'App/Layout',
  component: AppFixture,
  tags: ['ui-audit'],
  parameters: { appShell: true },
  args: { path: '/', empty: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const menu = canvas.queryByRole('button', { name: '展开导航' });
    await expect(menu ?? canvas.getByRole('navigation', { name: '主导航' })).toBeVisible();
    await expect(canvas.getByRole('heading', { level: 1 })).toBeVisible();
  },
} satisfies Meta<typeof AppFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Today: Story = {};
export const Feeds: Story = {
  args: { path: '/feeds' },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole('complementary', { name: '订阅源列表' }));
    await expect(canvas.getByRole('heading', { level: 1, name: '订阅与文章' })).toBeVisible();
    await userEvent.click(sidebar.getByRole('button', { name: feed.title }));
    await expect(sidebar.getByRole('button', { name: feed.title })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(canvas.getByRole('heading', { level: 2, name: feed.title })).toBeVisible();
    await userEvent.click(sidebar.getByRole('button', { name: /全部文章/ }));
    await expect(canvas.getByRole('heading', { level: 2, name: '全部文章' })).toBeVisible();
  },
};
export const Articles: Story = {
  args: { path: '/articles' },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole('heading', { level: 1, name: '订阅与文章' }),
    ).toBeVisible();
    const menu = canvas.queryByRole('button', { name: '展开导航' });
    if (menu) await userEvent.click(menu);
    const nav = within(canvas.getByRole('navigation', { name: '主导航' }));
    await expect(nav.getByRole('link', { name: /订阅与文章/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(nav.queryByRole('link', { name: /文章流/ })).not.toBeInTheDocument();
    if (menu) await userEvent.click(canvas.getByRole('button', { name: '收起导航' }));
  },
};
export const Archive: Story = { args: { path: '/archive' } };
export const Template: Story = { args: { path: '/template' } };
export const Settings: Story = { args: { path: '/settings' } };
export const EmptySettings: Story = { args: { path: '/settings', empty: true } };
export const EmptyArticles: Story = { args: { path: '/articles', empty: true } };
export const AddFeed: Story = {
  args: { path: '/feeds' },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: '添加订阅源' }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole('dialog', { name: '添加订阅源' }),
      ).toBeVisible(),
    );
  },
};
export const Reader: Story = {
  args: { path: '/articles' },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: articles[0].title }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole('region', { name: '文章内容' }),
      ).toBeVisible(),
    );
  },
};

export const LargeLibraryNavigation: Story = {
  tags: ['!ui-audit'],
  args: {
    state: createAppState({
      feeds: [{ ...feed, articleCount: 3000 }],
      articles: Array.from({ length: 3000 }, (_, index) => ({
        ...articles[0],
        id: `navigation-article-${index}`,
        title: `导航测试文章 ${index + 1}`,
        content: articles[0].content.repeat(40),
      })),
    }),
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: /订阅与文章/ }));
    await expect(
      await canvas.findByRole('heading', { level: 1, name: '订阅与文章' }),
    ).toBeVisible();
    await expect(canvas.getByText('3000 篇')).toBeVisible();
    await expect(within(canvas.getByLabelText('文章列表')).getAllByRole('article')).toHaveLength(
      50,
    );
    await expect(canvas.getByRole('status')).toHaveTextContent('第 1 / 60 页');
  },
};
