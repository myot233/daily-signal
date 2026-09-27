import type { AppState } from '@daily-signal/domain';
import { listDigests } from '@daily-signal/ai/repository';
import { getActiveDigestGenerationSessionId } from '@daily-signal/ai/generation-repository';
import { listArticles, listFeeds } from '@daily-signal/feeds/repository';
import { listProviders } from '@daily-signal/providers';
import { defaultTemplate } from '@daily-signal/domain/default-template';
import { getApiKey, getDefaultProviderModelId, getSettings } from '@daily-signal/settings';

export function getState(): AppState {
  const defaultProviderModelId = getDefaultProviderModelId();
  return {
    feeds: listFeeds(),
    articles: listArticles(),
    digests: listDigests(),
    settings: getSettings(),
    hasApiKey: Boolean(getApiKey()),
    defaultTemplate,
    providers: listProviders(),
    defaultProviderModelId,
    activeDigestGenerationSessionId: getActiveDigestGenerationSessionId(),
  };
}
