import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { providerConnectionSchema } from '@daily-signal/domain/providers/schemas';
import type { TranslateArticle } from './ArticleTranslation';
import type { Article, Feed } from '@daily-signal/domain';
import type { Perform, View, ViewProps } from '@daily-signal/client';
import { createAppState } from '../stories/fixtures';
import { ArticlesView } from './ArticlesView';

const publishedAt = '2026-09-09T08:00:00.000Z';
const feeds: Feed[] = [
  {
    id: 'engineering',
    title: '工程周刊',
    url: 'https://engineering.example.com/feed.xml',
    siteUrl: 'https://engineering.example.com',
    category: '工程',
    createdAt: publishedAt,
    lastFetchedAt: publishedAt,
    error: null,
    articleCount: 3,
  },
  {
    id: 'design',
    title: '设计观察',
    url: 'https://design.example.com/feed.xml',
    siteUrl: 'https://design.example.com',
    category: '设计',
    createdAt: publishedAt,
    lastFetchedAt: publishedAt,
    error: null,
    articleCount: 2,
  },
];

const articles: Article[] = [
  {
    id: 'react-release',
    feedId: 'engineering',
    feedTitle: '工程周刊',
    title: 'React 19 工程实践',
    url: 'https://engineering.example.com/react-19',
    content: '从组件边界到交互测试，逐步改善交付质量。',
    publishedAt,
    dateEstimated: false,
  },
  {
    id: 'content-match',
    feedId: 'engineering',
    feedTitle: '工程周刊',
    title: '可靠交付的日常',
    url: 'http://engineering.example.com/delivery',
    content: '通过 rEaCt 组件的用户交互验证可靠交付，而不是依赖实现细节。',
    publishedAt,
    dateEstimated: false,
  },
  {
    id: 'design-react',
    feedId: 'design',
    feedTitle: '设计观察',
    title: 'React 设计系统',
    url: 'https://design.example.com/components',
    content: '让设计语言在产品中保持一致。',
    publishedAt,
    dateEstimated: false,
  },
  {
    id: 'script-url',
    feedId: 'engineering',
    feedTitle: '工程周刊',
    title: '不可跳转的脚本地址',
    url: 'javascript:alert("unsafe")',
    content: '来源提供了不安全的地址，仍然保留正文供阅读。',
    publishedAt,
    dateEstimated: true,
  },
  {
    id: 'credential-url',
    feedId: 'design',
    feedTitle: '设计观察',
    title: '含凭据的来源地址',
    url: 'https://reader:secret@design.example.com/private',
    content: '',
    publishedAt,
    dateEstimated: false,
  },
];

const meta = {
  title: 'Views/Articles',
  component: ArticlesView,
  decorators: [
    function WithQueryClient(Story) {
      const [client] = useState(() => new QueryClient());
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  args: {
    state: createAppState({ feeds, articles }),
    translate: fn(async () => {
      throw new Error('此场景不应调用翻译');
    }),
    busy: null,
    navigate: fn(),
    notify: fn(),
    perform: fn<Perform>(async (_label, action) => {
      await action();
      return true;
    }),
  },
} satisfies Meta<typeof ArticlesView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
  play: async ({ canvasElement, step, userEvent }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole('textbox', { name: '搜索文章' });
    const source = canvas.getByRole('combobox', { name: '按来源筛选' });

    await step(
      'Safe sources open securely; unsafe sources remain readable without links',
      async () => {
        await expect(canvas.getByText('5 篇符合条件')).toBeVisible();
        for (const article of articles) {
          await expect(
            canvas.getByRole('heading', { level: 2, name: article.title }),
          ).toBeVisible();
        }

        for (const article of articles) {
          await expect(canvas.getByRole('button', { name: article.title })).toHaveAttribute(
            'aria-haspopup',
            'dialog',
          );
          await expect(canvas.queryByRole('link', { name: article.title })).not.toBeInTheDocument();
        }
        const readLinks = canvas.getAllByRole('link', { name: '打开原文' });
        await expect(readLinks).toHaveLength(3);
        for (const [index, link] of readLinks.entries()) {
          await expect(link).toHaveAttribute('href', articles[index].url);
          await expect(link).toHaveAttribute('target', '_blank');
          await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        }
        await expect(
          canvas.queryByRole('link', { name: '不可跳转的脚本地址' }),
        ).not.toBeInTheDocument();
        await expect(
          canvas.queryByRole('link', { name: '含凭据的来源地址' }),
        ).not.toBeInTheDocument();
        await expect(canvas.getAllByRole('link')).toHaveLength(3);
      },
    );

    await step(
      'Case-insensitive title and content search combines with the selected source',
      async () => {
        await userEvent.type(search, 'ReAcT');
        await expect(canvas.getByText('3 篇符合条件')).toBeVisible();
        await expect(
          canvas.getByRole('heading', { level: 2, name: 'React 设计系统' }),
        ).toBeVisible();

        await userEvent.selectOptions(source, 'engineering');
        await expect(canvas.getByText('2 篇符合条件')).toBeVisible();
        await expect(
          canvas.getByRole('heading', { level: 2, name: 'React 19 工程实践' }),
        ).toBeVisible();
        await expect(
          canvas.getByRole('heading', { level: 2, name: '可靠交付的日常' }),
        ).toBeVisible();
        await expect(
          canvas.queryByRole('heading', { level: 2, name: 'React 设计系统' }),
        ).not.toBeInTheDocument();
        await expect(
          canvas.queryByRole('heading', { level: 2, name: '不可跳转的脚本地址' }),
        ).not.toBeInTheDocument();
      },
    );

    await step('Preview follows the filtered order and restores the original trigger', async () => {
      const page = within(canvasElement.ownerDocument.body);
      const trigger = canvas.getByRole('button', { name: articles[0].title });
      await userEvent.click(trigger);
      const dialog = await page.findByRole('dialog', { name: articles[0].title });
      const reader = within(dialog);
      await expect(reader.getByRole('heading', { name: articles[0].title })).toHaveFocus();
      await expect(reader.getByRole('status', { name: '阅读位置' })).toHaveTextContent('1 / 2');
      await expect(reader.getByRole('button', { name: '上一篇' })).toBeDisabled();
      await expect(reader.getByText(articles[0].content)).toBeVisible();
      await expect(reader.getByRole('link', { name: '打开原文' })).toHaveAttribute(
        'href',
        articles[0].url,
      );

      await userEvent.click(reader.getByRole('button', { name: '下一篇' }));
      await expect(reader.getByRole('heading', { name: articles[1].title })).toHaveFocus();
      await expect(reader.getByRole('status', { name: '阅读位置' })).toHaveTextContent('2 / 2');
      await expect(reader.getByRole('button', { name: '下一篇' })).toBeDisabled();
      await userEvent.click(reader.getByRole('button', { name: '上一篇' }));
      await expect(reader.getByRole('heading', { name: articles[0].title })).toHaveFocus();
      await userEvent.keyboard('{Escape}');
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      await expect(search).toHaveValue('ReAcT');
      await expect(source).toHaveValue('engineering');
    });

    await step('An unmatched search can clear both filters and restore every article', async () => {
      await userEvent.clear(search);
      await userEvent.type(search, '没有这个关键词');
      await expect(canvas.getByText('0 篇符合条件')).toBeVisible();
      await expect(canvas.getByRole('heading', { name: '没有匹配的文章' })).toBeVisible();
      await expect(canvas.queryByRole('button', { name: '前往订阅源' })).not.toBeInTheDocument();

      const clearButtons = canvas.getAllByRole('button', { name: '清除筛选' });
      await userEvent.click(clearButtons[clearButtons.length - 1]);
      await expect(search).toHaveValue('');
      await expect(source).toHaveValue('');
      await expect(canvas.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument();
      await expect(canvas.getByText('5 篇符合条件')).toBeVisible();
      for (const article of articles) {
        await expect(canvas.getByRole('heading', { level: 2, name: article.title })).toBeVisible();
      }
    });
  },
};

export const Empty: Story = {
  args: { state: createAppState() },
  play: async ({ canvasElement, args, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('0 篇符合条件')).toBeVisible();
    await expect(canvas.getByRole('heading', { name: '暂无文章' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: '前往订阅源' }));
    await expect(args.navigate).toHaveBeenCalledWith('feeds');
  },
};

export const MissingContentAndUnsafeLinks: Story = {
  args: {
    busy: '生成日报',
    state: createAppState({
      feeds,
      articles: [{ ...articles[0], content: '' }, articles[3], articles[4]],
    }),
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: articles[0].title }));
    const dialog = await page.findByRole('dialog');
    const reader = within(dialog);
    await expect(reader.getByText('该来源未提供正文或摘要。')).toBeVisible();
    const link = reader.getByRole('link', { name: '打开原文' });
    await expect(link).toHaveAttribute('href', articles[0].url);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await userEvent.click(reader.getByRole('button', { name: '下一篇' }));
    await expect(reader.getByText(articles[3].content)).toBeVisible();
    await expect(reader.getByText('估计日期')).toBeVisible();
    await expect(
      reader.getByText('来源未提供有效发布时间，使用首次发现时间，不代表当日发布。'),
    ).toBeVisible();
    await expect(reader.getByText('原文链接不可用')).toBeVisible();
    await expect(reader.queryByRole('link')).not.toBeInTheDocument();
    await userEvent.click(reader.getByRole('button', { name: '下一篇' }));
    await expect(reader.getByText('该来源未提供正文或摘要。')).toBeVisible();
    await expect(reader.getByText('原文链接不可用')).toBeVisible();
    await expect(reader.queryByRole('link')).not.toBeInTheDocument();
    await expect(reader.getByRole('button', { name: '下一篇' })).toBeDisabled();
    await userEvent.click(reader.getByRole('button', { name: '关闭文章预览' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: articles[0].title })).toHaveFocus(),
    );
  },
};

const longArticle: Article = {
  ...articles[0],
  title: '在复杂系统里保留阅读上下文：从来源筛选到长文预览的工程实践与设计思考',
  content: [
    '第一段：保留订阅中的段落和换行。\n这一行仍属于第一段。',
    '<img src="https://example.com/tracker" onerror="alert(1)"> **这是纯文本，不是富文本**',
    ...Array.from(
      { length: 24 },
      (_, index) =>
        `第 ${index + 2} 段：阅读并不只是打开一个链接。通过保留列表的位置、筛选条件和原始来源，我们可以在连续浏览时减少上下文切换，把注意力放回文章本身。`,
    ),
    `https://example.com/${'long-path-'.repeat(50)}`,
    '末段：这是缓存内容的最后一段。',
  ].join('\n\n'),
};

export const LongReading: Story = {
  args: { state: createAppState({ feeds, articles: [longArticle, articles[1]] }) },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: longArticle.title }));
    const dialog = await page.findByRole('dialog');
    const reader = within(dialog);
    const body = reader.getByRole('region', { name: '文章内容' });
    await expect(body).toHaveTextContent('末段：这是缓存内容的最后一段。');
    await expect(reader.queryByRole('img')).not.toBeInTheDocument();
    await expect(body.textContent).toContain('<img src="https://example.com/tracker"');
    body.scrollTop = body.scrollHeight;
    await waitFor(() => expect(body.scrollTop).toBeGreaterThan(0));
    await userEvent.click(reader.getByRole('button', { name: '下一篇' }));
    await waitFor(() => expect(body.scrollTop).toBe(0));
    await expect(reader.getByRole('heading', { name: articles[1].title })).toHaveFocus();
    await userEvent.click(reader.getByRole('button', { name: '上一篇' }));
    await expect(reader.getByRole('heading', { name: longArticle.title })).toHaveFocus();
    // The reading region is keyboard-scrollable; focus stays inside the modal.
    await userEvent.tab({ shift: true });
    await expect(body).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(reader.getByRole('button', { name: '关闭文章预览' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    await expect(reader.getByRole('link', { name: '打开原文' })).toHaveFocus();
    await userEvent.tab();
    await expect(reader.getByRole('button', { name: '关闭文章预览' })).toHaveFocus();
  },
};

function UpdatingArticles(props: ViewProps & { navigate: (view: View) => void }) {
  const [state, setState] = useState(props.state);
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setState((current) => ({
            ...current,
            articles: [{ ...articles[1], title: '后台更新后的标题' }],
          }))
        }
      >
        模拟后台数据更新
      </button>
      <ArticlesView {...props} state={state} />
    </>
  );
}

export const BackgroundRefresh: Story = {
  render: (args) => <UpdatingArticles {...args} />,
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const update = canvas.getByRole('button', { name: '模拟后台数据更新' });
    await userEvent.click(canvas.getByRole('button', { name: articles[0].title }));
    const dialog = await page.findByRole('dialog');
    const reader = within(dialog);
    // Simulate new query data at the parent boundary, while the modal blocks user interaction.
    update.click();
    await waitFor(() =>
      expect(
        canvas.getByRole('button', { name: '后台更新后的标题', hidden: true }),
      ).toBeInTheDocument(),
    );
    await expect(reader.getByRole('heading', { name: articles[0].title })).toBeVisible();
    await expect(reader.getByRole('status', { name: '阅读位置' })).toHaveTextContent('1 / 5');
    await userEvent.click(reader.getByRole('button', { name: '下一篇' }));
    await expect(reader.getByRole('heading', { name: articles[1].title })).toBeVisible();
    await expect(reader.getByText(articles[1].content)).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(canvas.getByRole('heading', { level: 1 })).toHaveFocus());
    await userEvent.click(canvas.getByRole('button', { name: '后台更新后的标题' }));
    const updated = within(await page.findByRole('dialog', { name: '后台更新后的标题' }));
    await expect(updated.getByRole('status', { name: '阅读位置' })).toHaveTextContent('1 / 1');
    await expect(updated.getByRole('button', { name: '上一篇' })).toBeDisabled();
    await expect(updated.getByRole('button', { name: '下一篇' })).toBeDisabled();
  },
};

export const ReadingPosition: Story = {
  args: {
    state: createAppState({
      feeds,
      articles: Array.from({ length: 20 }, (_, index) => ({
        ...articles[0],
        id: `position-${index}`,
        title: `阅读位置测试 ${index + 1}`,
      })),
    }),
  },
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const view = canvasElement.ownerDocument.defaultView;
    const trigger = canvas.getByRole('button', { name: '阅读位置测试 12' });
    trigger.scrollIntoView({ block: 'center', behavior: 'instant' });
    await waitFor(() => expect(view?.scrollY).toBeGreaterThan(0));
    const scrollY = view?.scrollY;
    await userEvent.click(trigger);
    const dialog = await page.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '下一篇' }));
    await expect(within(dialog).getByRole('heading', { name: '阅读位置测试 13' })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole('button', { name: '关闭文章预览' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(view?.scrollY).toBe(scrollY);
  },
};

const translationProvider = providerConnectionSchema.parse({
  id: '10000000-0000-4000-8000-000000000001',
  presetId: 'custom',
  name: '阅读翻译',
  protocol: 'openai-chat-completions',
  baseUrl: 'https://translation.example.com/v1',
  enabled: true,
  hasCredential: true,
  options: {},
  revision: 1,
  createdAt: publishedAt,
  updatedAt: publishedAt,
  checks: [],
  models: [
    {
      id: '10000000-0000-4000-8000-000000000002',
      providerId: '10000000-0000-4000-8000-000000000001',
      modelId: 'reader-model',
      displayName: null,
      enabled: true,
      capabilities: {},
      options: {},
      source: 'manual',
      createdAt: publishedAt,
      updatedAt: publishedAt,
    },
  ],
});
const translationState = createAppState({
  feeds,
  articles: [
    { ...articles[0], content: 'A reliable release.\n\nKeep the original context.' },
    { ...articles[1], content: 'A second article.' },
  ],
  providers: [translationProvider],
  defaultProviderModelId: translationProvider.models[0].id,
});
const translated = {
  text: '一次可靠的发布。\n\n保留原始上下文。',
  model: 'reader-model',
  providerName: '阅读翻译',
};

export const TranslateAndSwitch: Story = {
  args: { state: translationState, translate: fn<TranslateArticle>(async () => translated) },
  play: async ({ canvasElement, userEvent, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: articles[0].title });
    await userEvent.click(trigger);
    const reader = within(await page.findByRole('dialog'));
    await expect(args.translate).not.toHaveBeenCalled();
    await userEvent.click(reader.getByRole('button', { name: 'AI 翻译为中文' }));
    await expect(await reader.findByText(translated.text.replace(/\s+/g, ' '))).toBeVisible();
    await expect(args.translate).toHaveBeenCalledTimes(1);
    await expect(args.translate).toHaveBeenCalledWith(
      {
        content: translationState.articles[0].content,
        providerModelId: translationProvider.models[0].id,
      },
      expect.any(AbortSignal),
    );
    await userEvent.click(reader.getByRole('button', { name: '原文' }));
    await expect(
      reader.getByText(translationState.articles[0].content.replace(/\s+/g, ' ')),
    ).toBeVisible();
    await userEvent.click(reader.getByRole('button', { name: '中文译文' }));
    await expect(reader.getByText(translated.text.replace(/\s+/g, ' '))).toBeVisible();
    await expect(args.translate).toHaveBeenCalledTimes(1);
    await userEvent.click(reader.getByRole('button', { name: '下一篇' }));
    await expect(reader.getByText(translationState.articles[1].content)).toBeVisible();
    await expect(reader.queryByText(translated.text.replace(/\s+/g, ' '))).not.toBeInTheDocument();
    await expect(args.translate).toHaveBeenCalledTimes(1);
    await userEvent.click(reader.getByRole('button', { name: '上一篇' }));
    await userEvent.click(reader.getByRole('button', { name: '中文译文' }));
    await expect(reader.getByText(translated.text.replace(/\s+/g, ' '))).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
    await userEvent.click(trigger);
    const reopened = within(await page.findByRole('dialog'));
    await userEvent.click(reopened.getByRole('button', { name: '中文译文' }));
    await expect(reopened.getByText(translated.text.replace(/\s+/g, ' '))).toBeVisible();
    await expect(args.translate).toHaveBeenCalledTimes(1);
  },
};

export const TranslationFailure: Story = {
  args: { state: translationState },
  render: function RetryTranslation(args) {
    const [translate] = useState<TranslateArticle>(() => {
      let attempt = 0;
      return async () => {
        if (++attempt === 1) throw new Error('模型服务限额或配额不足，请稍后重试。');
        return translated;
      };
    });
    return <ArticlesView {...args} translate={translate} />;
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: articles[0].title }));
    const reader = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
    await userEvent.click(reader.getByRole('button', { name: 'AI 翻译为中文' }));
    await expect(await reader.findByRole('alert')).toHaveTextContent('模型服务限额或配额不足');
    await expect(
      reader.getByText(translationState.articles[0].content.replace(/\s+/g, ' ')),
    ).toBeVisible();
    await userEvent.click(reader.getByRole('button', { name: '重试翻译' }));
    await expect(await reader.findByText(translated.text.replace(/\s+/g, ' '))).toBeVisible();
    await expect(reader.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const TranslationCancellation: Story = {
  args: {
    state: translationState,
    translate: fn<TranslateArticle>(
      (_input, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Cancelled', 'AbortError')),
            { once: true },
          );
        }),
    ),
  },
  play: async ({ canvasElement, userEvent, args }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('button', { name: articles[0].title }));
    const reader = within(await page.findByRole('dialog'));
    await userEvent.click(reader.getByRole('button', { name: 'AI 翻译为中文' }));
    await expect(await reader.findByText('正在翻译缓存正文，原文仍可阅读。')).toBeVisible();
    await expect(reader.getByRole('button', { name: '正在翻译…' })).toBeDisabled();
    await userEvent.click(reader.getByRole('button', { name: '取消翻译' }));
    await expect(await reader.findByRole('button', { name: 'AI 翻译为中文' })).toBeEnabled();
    await expect(args.translate).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ aborted: true }),
    );
    await userEvent.click(reader.getByRole('button', { name: 'AI 翻译为中文' }));
    await userEvent.click(reader.getByRole('button', { name: '下一篇' }));
    await expect(args.translate).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ aborted: true }),
    );
    await expect(reader.getByText(translationState.articles[1].content)).toBeVisible();
    await userEvent.click(reader.getByRole('button', { name: 'AI 翻译为中文' }));
    await userEvent.click(reader.getByRole('button', { name: '关闭文章预览' }));
    await waitFor(() => expect(page.queryByRole('dialog')).not.toBeInTheDocument());
    await expect(args.translate).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ aborted: true }),
    );
  },
};

export const TranslationNeedsModel: Story = {
  play: async ({ canvasElement, userEvent, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: articles[0].title }));
    const reader = within(await within(canvasElement.ownerDocument.body).findByRole('dialog'));
    await expect(reader.getByRole('button', { name: 'AI 翻译为中文' })).toBeDisabled();
    await expect(args.translate).not.toHaveBeenCalled();
    await userEvent.click(reader.getByRole('button', { name: '配置默认模型' }));
    await expect(args.navigate).toHaveBeenCalledWith('settings');
  },
};

export const DesktopSplitReader: Story = {
  args: { desktopLayout: true },
  decorators: [
    (Story) => (
      <div style={{ height: '800px' }}>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: articles[0].title }));
    const reader = within(await canvas.findByRole('region', { name: '文章预览' }));
    await expect(reader.getByText(articles[0].content)).toBeVisible();
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(canvas.getByRole('textbox', { name: '搜索文章' })).toBeVisible();
    await userEvent.click(reader.getByRole('button', { name: '下一篇' }));
    await expect(reader.getByText(articles[1].content)).toBeVisible();
    await userEvent.click(reader.getByRole('button', { name: '关闭文章预览' }));
    await expect(canvas.getByRole('heading', { name: '选择一篇文章' })).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox', { name: '搜索文章' }), 'React');
    await expect(canvas.getByText('3 篇符合条件')).toBeVisible();
  },
};
