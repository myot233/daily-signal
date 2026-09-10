import type { AppState } from '../../../shared/types';
import { listDigests } from '../ai/repository';
import { listArticles, listFeeds } from '../feeds/repository';
import { listProviders } from '../providers/repository';
import { defaultTemplate } from '../settings/defaults';
import { getApiKey, getDefaultProviderModelId, getSettings } from '../settings/repository';

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
  };
}
