import type { AppState } from '../../shared/types';

export function createAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    feeds: [],
    articles: [],
    digests: [],
    providers: [],
    defaultProviderModelId: null,
    activeDigestGenerationSessionId: null,
    hasApiKey: false,
    settings: {
      baseUrl: 'https://api.example.com/v1',
      model: 'example-model',
      deepseekThinking: 'disabled',
      template: '# 我的日报\n\n关注工程实践。',
    },
    defaultTemplate: '# 默认日报\n\n## 今日重点\n\n保留原始来源。',
    ...overrides,
  };
}
