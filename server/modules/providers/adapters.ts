import type { LanguageModel } from 'ai';
import type { SharedV4ProviderOptions as AiProviderOptions } from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import type { ConnectionInput } from '../../../shared/types';
import type { ProviderOptions } from '../../../shared/providers/schemas';
import type { ProviderProtocol } from '../../../shared/providers/catalog';
import { normalizePublicUrl } from '../../infrastructure/network/public-fetch';
import { createControlledProviderFetch } from './transport';
import type { ProviderTransport } from './transport';

export interface AdapterConfiguration {
  protocol: ProviderProtocol;
  presetId: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  options: ProviderOptions;
}

export interface RuntimeModel {
  model: LanguageModel;
  providerOptions?: AiProviderOptions;
  // SDK-facing budgets; callers must not reinterpret provider-specific thinking options.
  maxOutputTokens: number;
  connectionTestMaxOutputTokens: (shortBudget?: number) => number;
}

interface AdaptedModel {
  model: LanguageModel;
  providerOptions?: AiProviderOptions;
  // Explicit configuration, not a claim about the model's capabilities or server defaults.
  reasoningConfigured: boolean;
  outputTokenOverhead?: number;
}

type ProviderAdapter = (
  configuration: AdapterConfiguration,
  controlledFetch: typeof fetch,
) => AdaptedModel;

// A new protocol must implement the complete adapter contract before it can be selected.
const adapters: Record<ProviderProtocol, ProviderAdapter> = {
  'openai-responses': ({ baseUrl, modelId, apiKey, options }, controlledFetch) => {
    const provider = createOpenAI({
      baseURL: baseUrl,
      apiKey,
      fetch: controlledFetch,
      name: 'openai',
    });
    return {
      model: provider.responses(modelId),
      reasoningConfigured:
        options.reasoningEffort !== undefined && options.reasoningEffort !== 'none',
      providerOptions: options.reasoningEffort
        ? { openai: { reasoningEffort: options.reasoningEffort } }
        : undefined,
    };
  },
  'anthropic-messages': ({ baseUrl, modelId, apiKey, options }, controlledFetch) => {
    const provider = createAnthropic({
      baseURL: baseUrl,
      apiKey,
      fetch: controlledFetch,
      name: 'anthropic',
    });
    return {
      model: provider.messages(modelId),
      reasoningConfigured: options.anthropicThinkingBudget !== undefined,
      // The SDK adds this to maxOutputTokens; reserve it inside the product's total ceiling.
      outputTokenOverhead: options.anthropicThinkingBudget,
      providerOptions: options.anthropicThinkingBudget
        ? {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: options.anthropicThinkingBudget },
            },
          }
        : undefined,
    };
  },
  'gemini-generative-language': ({ baseUrl, modelId, apiKey, options }, controlledFetch) => {
    const provider = createGoogle({
      baseURL: baseUrl,
      apiKey,
      fetch: controlledFetch,
      name: 'google',
    });
    return {
      model: provider.languageModel(modelId),
      reasoningConfigured: (options.geminiThinkingBudget ?? 0) > 0,
      providerOptions:
        options.geminiThinkingBudget === undefined
          ? undefined
          : { google: { thinkingConfig: { thinkingBudget: options.geminiThinkingBudget } } },
    };
  },
  'openai-chat-completions': ({ presetId, baseUrl, modelId, apiKey, options }, controlledFetch) => {
    const deepseek = presetId === 'deepseek';
    const provider = createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: baseUrl,
      apiKey,
      fetch: controlledFetch,
      transformRequestBody: (body) => ({
        ...body,
        ...(deepseek ? { thinking: { type: options.deepseekThinking } } : {}),
        ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
      }),
    });
    return {
      model: provider.chatModel(modelId),
      reasoningConfigured:
        (deepseek && options.deepseekThinking === 'enabled') ||
        (options.reasoningEffort !== undefined && options.reasoningEffort !== 'none'),
    };
  },
};

export function createRuntimeModel(
  configuration: AdapterConfiguration,
  transport?: ProviderTransport,
): RuntimeModel {
  const controlledFetch = createControlledProviderFetch(
    configuration.baseUrl,
    configuration.options.timeoutMs,
    transport,
  );
  const adapted = adapters[configuration.protocol](configuration, controlledFetch);
  const totalBudget = configuration.options.maxOutputTokens;
  const overhead = adapted.outputTokenOverhead ?? 0;
  return {
    model: adapted.model,
    providerOptions: adapted.providerOptions,
    maxOutputTokens: Math.max(32, totalBudget - overhead),
    connectionTestMaxOutputTokens(shortBudget = 128) {
      const budget = adapted.reasoningConfigured ? totalBudget : Math.min(totalBudget, shortBudget);
      return Math.max(32, budget - overhead);
    },
  };
}

// The existing single-connection API has no preset or protocol fields. Resolve that
// legacy configuration at the adapter boundary, not in generation or test workflows.
export function createLegacyRuntimeModel(
  settings: Pick<ConnectionInput, 'baseUrl' | 'model' | 'deepseekThinking'>,
  apiKey: string,
  transport?: ProviderTransport,
): RuntimeModel {
  const baseUrl = normalizePublicUrl(settings.baseUrl).replace(/\/+$/, '');
  const presetId = new URL(baseUrl).hostname === 'api.deepseek.com' ? 'deepseek' : 'custom';
  return createRuntimeModel(
    {
      protocol: 'openai-chat-completions',
      presetId,
      baseUrl,
      modelId: settings.model,
      apiKey,
      options: {
        timeoutMs: 120_000,
        maxOutputTokens:
          presetId === 'deepseek' && settings.deepseekThinking === 'enabled' ? 16_384 : 6_000,
        deepseekThinking: settings.deepseekThinking,
      },
    },
    transport,
  );
}
