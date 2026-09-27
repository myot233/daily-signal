import { z } from 'zod';

export const curationSettingsSchema = z
  .object({
    enabled: z.boolean().default(true),
    tags: z
      .array(z.string().trim().min(1).max(40))
      .min(1, '至少选择一个兴趣标签。')
      .max(20)
      .refine(
        (tags) => new Set(tags.map((tag) => tag.toLocaleLowerCase())).size === tags.length,
        '兴趣标签不能重复。',
      )
      .default(['AI', '软件工程', '开源工具']),
    interests: z
      .string()
      .trim()
      .max(2_000)
      .default('优先有实现细节、实测数据和明确取舍的内容，少看营销、重复发布和泛泛的行业评论。'),
    maxItems: z.number().int().min(1).max(20).default(10),
    maxPerCategory: z.number().int().min(1).max(20).default(3),
    minScore: z.number().int().min(0).max(10).default(6),
    fetchFullText: z.boolean().default(true),
  })
  .strict();
export const categoryLabels = {
  ai: 'AI',
  engineering: '工程实践',
  tools: '开源工具',
  security: '安全',
  research: '研究',
  industry: '行业',
  other: '其他',
} as const;
export const categorySchema = z.enum([
  'ai',
  'engineering',
  'tools',
  'security',
  'research',
  'industry',
  'other',
]);
export const articleAnalysisSchema = z
  .object({
    category: categorySchema,
    kind: z.enum(['news', 'engineering', 'tool', 'research', 'opinion']),
    relevance: z.number().int().min(0).max(10),
    quality: z.number().int().min(0).max(10),
    reason: z.string().trim().min(1).max(200),
    matchedTags: z.array(z.string().max(40)).max(20),
  })
  .strict();
export const evidenceSchema = z
  .object({
    sourceId: z.string().min(1),
    quote: z.string().trim().min(12).max(400),
  })
  .strict();
export const digestCardSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(400),
  impact: z.string().trim().max(180),
  category: categorySchema,
  tags: z.array(z.string()),
  score: z.number().min(0).max(10),
  sourceIds: z.array(z.string()).min(1),
  evidence: z.array(evidenceSchema).min(1).max(4),
});
export const sourceDocumentSchema = z.object({
  sourceId: z.string(),
  content: z.string(),
  kind: z.enum(['web', 'feed']),
  status: z.enum(['extracted', 'feed-only', 'unavailable']),
});
export const digestCurationSchema = z.object({
  version: z.literal(1),
  settings: curationSettingsSchema,
  cards: z.array(digestCardSchema),
  documents: z.array(sourceDocumentSchema),
  stats: z.object({
    inputCount: z.number().int().nonnegative(),
    uniqueCount: z.number().int().nonnegative(),
    cachedCount: z.number().int().nonnegative(),
    eligibleCount: z.number().int().nonnegative(),
    candidateCount: z.number().int().nonnegative(),
    eventCount: z.number().int().nonnegative(),
    selectedCount: z.number().int().nonnegative(),
    fullTextCount: z.number().int().nonnegative(),
    modelCalls: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
  }),
});
export type CurationSettings = z.infer<typeof curationSettingsSchema>;
export type ArticleAnalysis = z.infer<typeof articleAnalysisSchema>;
export type DigestCard = z.infer<typeof digestCardSchema>;
export type DigestCuration = z.infer<typeof digestCurationSchema>;
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;
