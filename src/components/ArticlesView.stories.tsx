import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import type { Article, Feed } from '../../shared/types'
import type { Perform } from '../lib/client'
import { createAppState } from '../stories/fixtures'
import { ArticlesView } from './ArticlesView'

const publishedAt = '2026-09-09T08:00:00.000Z'
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
]

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
]

const meta = {
  title: 'Views/Articles',
  component: ArticlesView,
  args: {
    state: createAppState({ feeds, articles }),
    busy: null,
    navigate: fn(),
    notify: fn(),
    perform: fn<Perform>(async (_label, action) => {
      await action()
      return true
    }),
  },
} satisfies Meta<typeof ArticlesView>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {
  play: async ({ canvasElement, step, userEvent }) => {
    const canvas = within(canvasElement)
    const search = canvas.getByRole('textbox', { name: '搜索文章' })
    const source = canvas.getByRole('combobox', { name: '按来源筛选' })

    await step('Safe sources open securely; unsafe sources remain readable without links', async () => {
      await expect(canvas.getByText('5 篇符合条件')).toBeVisible()
      for (const article of articles) {
        await expect(canvas.getByRole('heading', { level: 2, name: article.title })).toBeVisible()
      }

      for (const article of articles.slice(0, 3)) {
        const link = canvas.getByRole('link', { name: article.title })
        await expect(link).toHaveAttribute('href', article.url)
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      }
      const readLinks = canvas.getAllByRole('link', { name: '阅读原文' })
      await expect(readLinks).toHaveLength(3)
      for (const [index, link] of readLinks.entries()) {
        await expect(link).toHaveAttribute('href', articles[index].url)
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      }
      await expect(canvas.queryByRole('link', { name: '不可跳转的脚本地址' })).not.toBeInTheDocument()
      await expect(canvas.queryByRole('link', { name: '含凭据的来源地址' })).not.toBeInTheDocument()
      await expect(canvas.getAllByRole('link')).toHaveLength(6)
    })

    await step('Case-insensitive title and content search combines with the selected source', async () => {
      await userEvent.type(search, 'ReAcT')
      await expect(canvas.getByText('3 篇符合条件')).toBeVisible()
      await expect(canvas.getByRole('heading', { level: 2, name: 'React 设计系统' })).toBeVisible()

      await userEvent.selectOptions(source, 'engineering')
      await expect(canvas.getByText('2 篇符合条件')).toBeVisible()
      await expect(canvas.getByRole('heading', { level: 2, name: 'React 19 工程实践' })).toBeVisible()
      await expect(canvas.getByRole('heading', { level: 2, name: '可靠交付的日常' })).toBeVisible()
      await expect(canvas.queryByRole('heading', { level: 2, name: 'React 设计系统' })).not.toBeInTheDocument()
      await expect(canvas.queryByRole('heading', { level: 2, name: '不可跳转的脚本地址' })).not.toBeInTheDocument()
    })

    await step('An unmatched search can clear both filters and restore every article', async () => {
      await userEvent.clear(search)
      await userEvent.type(search, '没有这个关键词')
      await expect(canvas.getByText('0 篇符合条件')).toBeVisible()
      await expect(canvas.getByRole('heading', { name: '这一页，暂时没有匹配的文章。' })).toBeVisible()
      await expect(canvas.queryByRole('button', { name: '前往订阅源' })).not.toBeInTheDocument()

      const clearButtons = canvas.getAllByRole('button', { name: '清除筛选' })
      await userEvent.click(clearButtons[clearButtons.length - 1])
      await expect(search).toHaveValue('')
      await expect(source).toHaveValue('')
      await expect(canvas.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument()
      await expect(canvas.getByText('5 篇符合条件')).toBeVisible()
      for (const article of articles) {
        await expect(canvas.getByRole('heading', { level: 2, name: article.title })).toBeVisible()
      }
    })
  },
}

export const Empty: Story = {
  args: { state: createAppState() },
  play: async ({ canvasElement, args, userEvent }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('0 篇符合条件')).toBeVisible()
    await expect(canvas.getByRole('heading', { name: '还没有文章，先带几个来源进来。' })).toBeVisible()
    await expect(canvas.queryByRole('button', { name: '清除筛选' })).not.toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: '前往订阅源' }))
    await expect(args.navigate).toHaveBeenCalledWith('feeds')
  },
}
