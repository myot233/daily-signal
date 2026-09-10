import type { LanguageModel } from 'ai';
import type { SharedV4ProviderOptions as AiProviderOptions } from '@ai-sdk/provider';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import type { ProviderOptions } from '../../shared/providers/schemas';
import type { ProviderProtocol } from '../../shared/providers/catalog';
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
  options: ProviderOptions;
  requestMaxOutputTokens: (totalBudget: number) => number;
}

const unchangedOutputBudget = (totalBudget: number) => totalBudget;

export function createRuntimeModel(configuration: AdapterConfiguration, transport?: ProviderTransport): RuntimeModel {
  const controlledFetch = createControlledProviderFetch(configuration.baseUrl, configuration.options.timeoutMs, transport);
  const { protocol, baseUrl, modelId, apiKey, options } = configuration;
  if (protocol === 'openai-responses') {
    const provider = createOpenAI({ baseURL: baseUrl, apiKey, fetch: controlledFetch, name: 'openai' });
    return {
      model: provider.responses(modelId), options, requestMaxOutputTokens: unchangedOutputBudget,
      providerOptions: options.reasoningEffort ? { openai: { reasoningEffort: options.reasoningEffort } } : undefined,
    };
  }
  if (protocol === 'anthropic-messages') {
    const provider = createAnthropic({ baseURL: baseUrl, apiKey, fetch: controlledFetch, name: 'anthropic' });
    return {
      model: provider.messages(modelId), options,
      // Anthropic's SDK adds thinkingBudget to maxOutputTokens. The product setting
      // is a total output ceiling, so reserve the explicit thinking budget here.
      requestMaxOutputTokens: totalBudget => Math.max(32, totalBudget - (options.anthropicThinkingBudget ?? 0)),
      providerOptions: options.anthropicThinkingBudget
        ? { anthropic: { thinking: { type: 'enabled', budgetTokens: options.anthropicThinkingBudget } } } : undefined,
    };
  }
  if (protocol === 'gemini-generative-language') {
    const provider = createGoogle({ baseURL: baseUrl, apiKey, fetch: controlledFetch, name: 'google' });
    return {
      model: provider.languageModel(modelId), options, requestMaxOutputTokens: unchangedOutputBudget,
      providerOptions: options.geminiThinkingBudget === undefined
        ? undefined : { google: { thinkingConfig: { thinkingBudget: options.geminiThinkingBudget } } },
    };
  }
  const provider = createOpenAICompatible({
    name: 'openai-compatible', baseURL: baseUrl, apiKey, fetch: controlledFetch,
    transformRequestBody: body => ({
      ...body,
      ...(configuration.presetId === 'deepseek' ? { thinking: { type: options.deepseekThinking } } : {}),
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {}),
    }),
  });
  return { model: provider.chatModel(modelId), options, requestMaxOutputTokens: unchangedOutputBudget };
}
