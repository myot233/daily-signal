export const providerProtocols = [
  'openai-responses',
  'openai-chat-completions',
  'anthropic-messages',
  'gemini-generative-language',
] as const;

export type ProviderProtocol = (typeof providerProtocols)[number];

export interface ProviderPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultBaseUrl: string;
  defaultProtocol: ProviderProtocol;
  protocols: readonly ProviderProtocol[];
  modelDiscovery: boolean;
}

export const providerCatalog = [
  {
    id: 'openai', name: 'OpenAI', description: '官方 Responses API，亦可显式选择 Chat Completions。',
    icon: 'openai.svg', defaultBaseUrl: 'https://api.openai.com/v1', defaultProtocol: 'openai-responses',
    protocols: ['openai-responses', 'openai-chat-completions'], modelDiscovery: true,
  },
  {
    id: 'deepseek', name: 'DeepSeek', description: '官方 OpenAI-compatible API，支持独立思考开关。',
    icon: 'deepseek-color.svg', defaultBaseUrl: 'https://api.deepseek.com', defaultProtocol: 'openai-chat-completions',
    protocols: ['openai-chat-completions'], modelDiscovery: true,
  },
  {
    id: 'anthropic', name: 'Anthropic', description: 'Claude 原生 Messages API。',
    icon: 'anthropic.svg', defaultBaseUrl: 'https://api.anthropic.com/v1', defaultProtocol: 'anthropic-messages',
    protocols: ['anthropic-messages'], modelDiscovery: true,
  },
  {
    id: 'gemini', name: 'Google Gemini', description: 'Google Generative Language 原生 API。',
    icon: 'gemini-color.svg', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultProtocol: 'gemini-generative-language',
    protocols: ['gemini-generative-language'], modelDiscovery: true,
  },
  {
    id: 'bailian', name: '阿里云百炼', description: 'DashScope OpenAI 兼容端点。',
    icon: 'bailian-color.svg', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultProtocol: 'openai-chat-completions',
    protocols: ['openai-chat-completions'], modelDiscovery: true,
  },
  {
    id: 'moonshot', name: 'Moonshot', description: 'Moonshot AI OpenAI 兼容端点。',
    icon: 'moonshot.svg', defaultBaseUrl: 'https://api.moonshot.cn/v1', defaultProtocol: 'openai-chat-completions',
    protocols: ['openai-chat-completions'], modelDiscovery: true,
  },
  {
    id: 'zhipu', name: '智谱 AI', description: 'BigModel OpenAI 兼容端点。',
    icon: 'zhipu-color.svg', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultProtocol: 'openai-chat-completions',
    protocols: ['openai-chat-completions'], modelDiscovery: true,
  },
  {
    id: 'siliconflow', name: '硅基流动', description: 'SiliconCloud OpenAI 兼容端点。',
    icon: 'siliconcloud-color.svg', defaultBaseUrl: 'https://api.siliconflow.cn/v1', defaultProtocol: 'openai-chat-completions',
    protocols: ['openai-chat-completions'], modelDiscovery: true,
  },
  {
    id: 'openrouter', name: 'OpenRouter', description: '多模型 OpenAI 兼容网关。',
    icon: 'openrouter.svg', defaultBaseUrl: 'https://openrouter.ai/api/v1', defaultProtocol: 'openai-chat-completions',
    protocols: ['openai-chat-completions'], modelDiscovery: true,
  },
  {
    id: 'custom', name: '自定义网关', description: '为 sub2api 或其他网关指定其真实对外协议。',
    icon: 'gateway.svg', defaultBaseUrl: 'https://api.example.com/v1', defaultProtocol: 'openai-chat-completions',
    protocols: providerProtocols, modelDiscovery: true,
  },
] as const satisfies readonly ProviderPreset[];

export const protocolLabels: Record<ProviderProtocol, string> = {
  'openai-responses': 'OpenAI Responses',
  'openai-chat-completions': 'OpenAI Chat Completions',
  'anthropic-messages': 'Anthropic Messages',
  'gemini-generative-language': 'Gemini native',
};

export function getProviderPreset(id: string): ProviderPreset | undefined {
  return providerCatalog.find(preset => preset.id === id);
}
