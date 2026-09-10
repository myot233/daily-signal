import { Liquid } from 'liquidjs';
import type { Article } from './types';

export interface TemplateContext {
  date: string;
  startAt: string;
  endAt: string;
  articleCount: number;
  model: string;
  articles: Pick<Article, 'title' | 'url' | 'feedTitle' | 'publishedAt' | 'dateEstimated'>[];
}

const engine = new Liquid({
  strictVariables: true, strictFilters: true, ownPropertyOnly: true,
  // Templates only see supplied data; includes cannot read files or URLs.
  templates: Object.create(null),
  parseLimit: 12_000, renderLimit: 100, memoryLimit: 100_000,
  timezoneOffset: 0,
});

export class TemplateError extends Error {}

function templateError(error: unknown): TemplateError {
  // Liquid's full error message includes source excerpts. Only show its first line.
  const detail = error instanceof Error ? error.message.split('\n')[0]!.slice(0, 240) : '请检查模板语法。';
  return new TemplateError(`模板错误：${detail}`);
}

export function validateDigestTemplate(template: string): void {
  if (!template.trim()) throw new TemplateError('模板不能为空。');
  try { engine.parse(template); } catch (error) { throw templateError(error); }
}

export function renderDigestTemplate(template: string, context: TemplateContext): string {
  validateDigestTemplate(template);
  try {
    // Explicitly project the context so callers cannot accidentally expose settings or keys.
    const { date, startAt, endAt, articleCount, model } = context;
    const articles = context.articles.map(({ title, url, feedTitle, publishedAt, dateEstimated }) => ({ title, url, feedTitle, publishedAt, dateEstimated }));
    const rendered: string = engine.parseAndRenderSync(template, { date, startAt, endAt, articleCount, model, articles }, { templateLimit: 10_000 });
    if (rendered.length > 30_000) throw new Error('渲染结果不能超过 30,000 字符。');
    return rendered;
  } catch (error) { throw templateError(error); }
}

export const templateExampleContext: TemplateContext = {
  date: '2026-09-10', startAt: '2026-09-09T16:00:00.000Z', endAt: '2026-09-10T16:00:00.000Z',
  articleCount: 2, model: 'example-model',
  articles: [
    { title: '示例：开发工具更新', url: 'https://example.com/tools', feedTitle: '工程博客', publishedAt: '2026-09-10T02:00:00.000Z', dateEstimated: false },
    { title: '示例：开源项目动态', url: 'https://example.com/open-source', feedTitle: '开源动态', publishedAt: '2026-09-10T03:00:00.000Z', dateEstimated: true },
  ],
};
