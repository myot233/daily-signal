import { z } from 'zod';
import { providerConnectionSchema, providerOptionsSchema } from './providers/schemas';
import { providerProtocolSchema } from './providers/schemas';

export const feedSchema = z.object({
  id: z.string(), url: z.string(), title: z.string(), category: z.string(), siteUrl: z.string(),
  createdAt: z.string(), lastFetchedAt: z.string().nullable(), error: z.string().nullable(), articleCount: z.number().int().nonnegative(),
});
export const articleSchema = z.object({
  id: z.string(), feedId: z.string(), feedTitle: z.string(), title: z.string(), url: z.string(),
  content: z.string(), publishedAt: z.string(), dateEstimated: z.boolean(),
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
// Omitted keeps the saved key; null explicitly removes it. Responses never contain it.
export const settingsUpdateSchema = settingsSchema.extend({ apiKey: apiKeySchema.nullable().optional() });
export const connectionSchema = modelConfigSchema.extend({ apiKey: apiKeySchema.optional() }).strict();
export const digestInputSchema = z.object({
  date: z.iso.date(),
  startAt: z.iso.datetime().transform(value => new Date(value).toISOString()),
  endAt: z.iso.datetime().transform(value => new Date(value).toISOString()),
  apiKey: apiKeySchema.optional(),
  providerModelId: z.string().uuid().optional(),
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
  providerId: z.string().uuid().nullable(), providerName: z.string().nullable(),
  providerProtocol: providerProtocolSchema.nullable(), providerModelId: z.string().uuid().nullable(),
  providerOptions: providerOptionsSchema.nullable(),
});
export const digestGenerationStatusSchema = z.enum(['running', 'completed', 'failed']);
const digestGenerationEventMeta = {
  id: z.number().int().positive(),
  sessionId: z.string().uuid(),
  createdAt: z.string(),
};
export const digestGenerationEventSchema = z.discriminatedUnion('type', [
  z.object({ ...digestGenerationEventMeta, type: z.literal('queued') }),
  z.object({
    ...digestGenerationEventMeta,
    type: z.literal('preparing'),
    articleCount: z.number().int().nonnegative(),
    batchCount: z.number().int().positive(),
  }),
  z.object({
    ...digestGenerationEventMeta,
    type: z.literal('extracting'),
    current: z.number().int().positive(),
    total: z.number().int().positive(),
  }),
  z.object({ ...digestGenerationEventMeta, type: z.literal('synthesizing') }),
  z.object({ ...digestGenerationEventMeta, type: z.literal('archiving') }),
  z.object({
    ...digestGenerationEventMeta,
    type: z.literal('completed'),
    digestId: z.string().min(1),
  }),
  z.object({
    ...digestGenerationEventMeta,
    type: z.literal('failed'),
    message: z.string().min(1),
  }),
]);
export const digestGenerationStartSchema = z.object({ sessionId: z.string().uuid() });
export const digestGenerationSubscriptionSchema = z
  .object({
    sessionId: z.string().uuid(),
    afterEventId: z.number().int().nonnegative().optional(),
  })
  .strict();
export const appStateSchema = z.object({
  feeds: z.array(feedSchema), articles: z.array(articleSchema), digests: z.array(digestSchema),
  settings: settingsSchema, hasApiKey: z.boolean(), defaultTemplate: z.string(),
  providers: z.array(providerConnectionSchema), defaultProviderModelId: z.string().uuid().nullable(),
  activeDigestGenerationSessionId: z.string().uuid().nullable(),
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
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;
export type Digest = z.infer<typeof digestSchema>;
export type AppState = z.infer<typeof appStateSchema>;
export type DigestGenerationStatus = z.infer<typeof digestGenerationStatusSchema>;
export type DigestGenerationEvent = z.infer<typeof digestGenerationEventSchema>;
type WithoutGenerationEventMeta<T> = T extends unknown
  ? Omit<T, 'id' | 'sessionId' | 'createdAt'>
  : never;
export type DigestGenerationEventData = WithoutGenerationEventMeta<DigestGenerationEvent>;
export type DigestGenerationProgress = Exclude<
  DigestGenerationEventData,
  { type: 'queued' | 'completed' | 'failed' }
>;
export type DigestGenerationSubscription = z.infer<
  typeof digestGenerationSubscriptionSchema
>;
export type RefreshResult = z.infer<typeof refreshResultSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
export type ConnectionInput = z.infer<typeof connectionSchema>;
export type DigestInput = z.infer<typeof digestInputSchema>;
