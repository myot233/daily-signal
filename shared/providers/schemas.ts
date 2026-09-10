import { z } from 'zod';
import { getProviderPreset, providerCatalog, providerProtocols } from './catalog';

export const providerProtocolSchema = z.enum(providerProtocols);
export const providerOptionsSchema = z.object({
  timeoutMs: z.number().int().min(5_000).max(600_000).default(120_000),
  maxOutputTokens: z.number().int().min(32).max(65_536).default(6_000),
  reasoningEffort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']).optional(),
  deepseekThinking: z.enum(['disabled', 'enabled']).default('disabled'),
  anthropicThinkingBudget: z.number().int().min(1_024).max(64_000).optional(),
  geminiThinkingBudget: z.number().int().min(0).max(65_536).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.anthropicThinkingBudget !== undefined && value.anthropicThinkingBudget > value.maxOutputTokens - 32) {
    ctx.addIssue({ code: 'custom', path: ['anthropicThinkingBudget'], message: 'Anthropic 思考预算后需至少保留 32 个输出 tokens。' });
  }
  if (value.deepseekThinking === 'enabled' && value.maxOutputTokens < 1_024) {
    ctx.addIssue({ code: 'custom', path: ['maxOutputTokens'], message: '开启 DeepSeek 思考时，输出上限至少为 1,024。' });
  }
});

export const providerBaseUrlSchema = z.string().trim().max(2_000).transform((value, ctx) => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('invalid');
    return url.href.replace(/\/+$/, '');
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Base URL 必须是公开 HTTPS API 根地址，且不含凭据、查询参数或锚点。' });
    return z.NEVER;
  }
});

const providerFieldsSchema = z.object({
  presetId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1, '请输入连接名称。').max(100),
  protocol: providerProtocolSchema,
  baseUrl: providerBaseUrlSchema,
  enabled: z.boolean().default(true),
  options: providerOptionsSchema.default({ timeoutMs: 120_000, maxOutputTokens: 6_000, deepseekThinking: 'disabled' }),
});

function validateProviderFields(value: z.infer<typeof providerFieldsSchema>, ctx: z.RefinementCtx) {
  const preset = getProviderPreset(value.presetId);
  if (!preset || (preset.id !== 'custom' && !preset.protocols.includes(value.protocol))) {
    ctx.addIssue({ code: 'custom', path: ['protocol'], message: '所选服务商不支持这个协议；自定义网关可选择任一已实现协议。' });
  }
  const forbiddenSuffixes: Record<typeof value.protocol, RegExp> = {
    'openai-responses': /\/responses\/?$/,
    'openai-chat-completions': /\/chat\/completions\/?$/,
    'anthropic-messages': /\/messages\/?$/,
    'gemini-generative-language': /(?::generateContent|:streamGenerateContent)\/?$/,
  };
  if (forbiddenSuffixes[value.protocol].test(new URL(value.baseUrl).pathname)) {
    ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: '请填写 API 根地址，不要包含协议的最终请求路径。' });
  }
}

export const credentialSchema = z.string().max(4_096)
  .refine(value => !/\p{Cc}/u.test(value), 'API Key 不能包含控制字符。')
  .transform(value => value.trim()).pipe(z.string().min(1, '请输入 API Key。'));

export const providerCreateSchema = providerFieldsSchema.extend({
  credential: credentialSchema.optional(),
  initialModelId: z.string().trim().min(1).max(300).optional(),
}).strict().superRefine(validateProviderFields);

export const providerUpdateSchema = providerFieldsSchema.extend({
  id: z.string().uuid(),
  revision: z.number().int().positive(),
  // Omitted keeps the key unless target/protocol changes; null explicitly removes it.
  credential: credentialSchema.nullable().optional(),
}).strict().superRefine(validateProviderFields);

export const providerModelSourceSchema = z.enum(['manual', 'discovered', 'migration']);
export const providerModelCapabilitiesSchema = z.object({
  vision: z.boolean().nullable().default(null),
  reasoning: z.boolean().nullable().default(null),
  contextWindow: z.number().int().positive().nullable().default(null),
}).strict();
export const providerModelOptionsSchema = z.object({
  displayName: z.string().trim().max(200).optional(),
}).strict();

export const providerModelSchema = z.object({
  id: z.string().uuid(), providerId: z.string().uuid(), modelId: z.string(), displayName: z.string().nullable(),
  enabled: z.boolean(), capabilities: providerModelCapabilitiesSchema, options: providerModelOptionsSchema,
  source: providerModelSourceSchema, createdAt: z.string(), updatedAt: z.string(),
});
export const providerCheckSchema = z.object({
  id: z.string().uuid(), providerId: z.string().uuid(), modelId: z.string().nullable(),
  configRevision: z.number().int().positive(), stage: z.enum(['endpoint', 'authentication', 'model']),
  status: z.enum(['passed', 'failed', 'skipped']), latencyMs: z.number().int().nonnegative(),
  checkedAt: z.string(), safeError: z.string().nullable(),
});
export const providerConnectionSchema = z.object({
  id: z.string().uuid(), presetId: z.string(), name: z.string(), protocol: providerProtocolSchema,
  baseUrl: z.string(), enabled: z.boolean(), options: providerOptionsSchema, revision: z.number().int().positive(),
  createdAt: z.string(), updatedAt: z.string(), hasCredential: z.boolean(), models: z.array(providerModelSchema),
  checks: z.array(providerCheckSchema),
});

export const providerCatalogSchema = z.array(z.object({
  id: z.string(), name: z.string(), description: z.string(), icon: z.string(), defaultBaseUrl: z.string(),
  defaultProtocol: providerProtocolSchema, protocols: z.array(providerProtocolSchema), modelDiscovery: z.boolean(),
}));
export const providerListSchema = z.object({
  catalog: providerCatalogSchema,
  providers: z.array(providerConnectionSchema),
  defaultProviderModelId: z.string().uuid().nullable(),
});

export const providerIdSchema = z.object({ id: z.string().uuid() }).strict();
export const providerRemoveSchema = z.object({ id: z.string().uuid(), revision: z.number().int().positive() }).strict();
export const providerDiscoverSchema = providerIdSchema;
export const providerDiscoveredModelSchema = z.object({ modelId: z.string(), displayName: z.string().nullable() });
export const providerDiscoverResultSchema = z.object({ models: z.array(providerDiscoveredModelSchema).max(500) });
export const providerTestSchema = z.object({ providerId: z.string().uuid(), modelId: z.string().trim().min(1).max(300), confirmCharge: z.literal(true) }).strict();
export const providerTestResultSchema = z.object({ checks: z.array(providerCheckSchema) });
export const providerModelSaveSchema = z.object({
  providerId: z.string().uuid(), modelId: z.string().trim().min(1, '请输入模型 ID。').max(300),
  displayName: z.string().trim().max(200).nullable().optional(), enabled: z.boolean().default(true),
  source: z.enum(['manual', 'discovered']).default('manual'),
}).strict();
export const providerModelRemoveSchema = z.object({ id: z.string().uuid() }).strict();
export const setDefaultProviderModelSchema = z.object({ providerModelId: z.string().uuid().nullable() }).strict();

export type ProviderOptions = z.infer<typeof providerOptionsSchema>;
export type ProviderModelCapabilities = z.infer<typeof providerModelCapabilitiesSchema>;
export type ProviderModelOptions = z.infer<typeof providerModelOptionsSchema>;
export type ProviderCreateInput = z.infer<typeof providerCreateSchema>;
export type ProviderUpdateInput = z.infer<typeof providerUpdateSchema>;
export type ProviderModel = z.infer<typeof providerModelSchema>;
export type ProviderConnection = z.infer<typeof providerConnectionSchema>;
export type ProviderCheck = z.infer<typeof providerCheckSchema>;
export type ProviderList = z.infer<typeof providerListSchema>;
export type ProviderModelSaveInput = z.infer<typeof providerModelSaveSchema>;

// Compile-time guard: public catalog data is safe to return verbatim.
providerCatalogSchema.parse(providerCatalog);
