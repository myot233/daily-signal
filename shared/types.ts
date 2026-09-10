import { z } from 'zod';
import { generationProgressSchema } from './progress';

export const feedSchema = z.object({
  id: z.string(), url: z.string(), title: z.string(), category: z.string(), siteUrl: z.string(),
  createdAt: z.string(), lastFetchedAt: z.string().nullable(), error: z.string().nullable(), articleCount: z.number().int().nonnegative(),
});
export const webFetchResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('success'), url: z.string(), fetchedAt: z.string(), content: z.string(), truncated: z.boolean() }),
  z.object({ status: z.literal('error'), url: z.string(), fetchedAt: z.string(), error: z.string() }),
]);
export type WebFetchResult = z.infer<typeof webFetchResultSchema>;
export const articleSchema = z.object({
  id: z.string(), feedId: z.string(), feedTitle: z.string(), title: z.string(), url: z.string(),
  content: z.string(), publishedAt: z.string(), dateEstimated: z.boolean(),
  webFetch: webFetchResultSchema.optional(),
});
export const modelConfigSchema = z.object({
  baseUrl: z.string().trim().max(2_000).transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.search || value.includes('#') || /\/chat\/completions\/?$/.test(url.pathname)) throw new Error('invalid');
      return url.href.replace(/\/+$/, '');
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Base URL 必须是 HTTPS API 根地址，不含凭据、查询参数或 /chat/completions。' });
      return z.NEVER;
    }
  }),
  model: z.string().trim().min(1, '请输入模型名称。').max(200),
  deepseekThinking: z.enum(['disabled', 'enabled']),
});
export const apiKeySchema = z.string().max(4_096)
  .refine(value => !/\p{Cc}/u.test(value), 'API Key 不能包含控制字符。')
  .transform(value => value.trim()).pipe(z.string().min(1, '请输入 API Key。'));
export const settingsSchema = modelConfigSchema.extend({ template: z.string().trim().min(1, '模板不能为空。').max(12_000) }).strict();
export const connectionSchema = modelConfigSchema.extend({ apiKey: apiKeySchema }).strict();
export const digestInputSchema = z.object({
  date: z.iso.date(),
  startAt: z.iso.datetime().transform(value => new Date(value).toISOString()),
  endAt: z.iso.datetime().transform(value => new Date(value).toISOString()),
  apiKey: apiKeySchema,
}).strict().superRefine((value, ctx) => {
  const start = Date.parse(value.startAt), end = Date.parse(value.endAt);
  const hours = (end - start) / 3_600_000;
  const offset = (start - Date.parse(`${value.date}T00:00:00Z`)) / 3_600_000;
  if (hours < 23 || hours > 25 || offset < -14 || offset > 12) {
    ctx.addIssue({ code: 'custom', message: '请提交所选本地日期从午夜到下一日午夜的时间范围。' });
  }
});
export const digestSchema = z.object({
  id: z.string(), date: z.string(), title: z.string(), markdown: z.string(), createdAt: z.string(),
  articleCount: z.number().int().nonnegative(), model: z.string(), sources: z.array(articleSchema),
  workflow: z.array(generationProgressSchema).default([]),
});
export const appStateSchema = z.object({
  feeds: z.array(feedSchema), articles: z.array(articleSchema), digests: z.array(digestSchema),
  settings: settingsSchema, defaultTemplate: z.string(),
});
const sourceErrorSchema = z.object({ url: z.string(), error: z.string() });
export const refreshResultSchema = z.object({ added: z.number().int().nonnegative(), errors: z.array(sourceErrorSchema) });
export const importResultSchema = z.object({ imported: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), errors: z.array(sourceErrorSchema) });
export const addFeedSchema = z.object({ url: z.string().trim().min(1, '请输入订阅地址。').max(8_192), category: z.string().trim().max(200).optional() }).strict();
export const importOpmlSchema = z.object({ opml: z.string().min(1).refine(value => new TextEncoder().encode(value).byteLength <= 2 * 1024 * 1024, 'OPML 不能超过 2 MiB。') }).strict();
export const idSchema = z.object({ id: z.string().min(1) }).strict();
export const okSchema = z.object({ ok: z.literal(true) });

export type Feed = z.infer<typeof feedSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Digest = z.infer<typeof digestSchema>;
export type AppState = z.infer<typeof appStateSchema>;
export type RefreshResult = z.infer<typeof refreshResultSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
export type ConnectionInput = z.infer<typeof connectionSchema>;
export type DigestInput = z.infer<typeof digestInputSchema>;
