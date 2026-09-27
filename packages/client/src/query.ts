import { queryOptions } from '@tanstack/react-query';
import type { Feed } from '@daily-signal/domain';
import { rpc } from './index';

export const feedIconQueryOptions = (feed: Pick<Feed, 'id' | 'siteUrl' | 'url'>) =>
  queryOptions({
    queryKey: ['feed-icon', feed.id, feed.siteUrl, feed.url],
    queryFn: () => rpc.feeds.icon({ id: feed.id }),
    staleTime: 60 * 60 * 1000,
    retry: false,
    networkMode: 'always',
  });

export const appStateQueryOptions = queryOptions({
  queryKey: ['app-state'],
  queryFn: () => rpc.state(),
  retry: false,
  staleTime: 30_000,
  networkMode: 'always',
});

export const feedRefreshQueryOptions = queryOptions({
  queryKey: ['feed-refresh'],
  queryFn: () => rpc.feeds.status(),
  refetchInterval: (query) => (query.state.data?.status === 'running' ? 1_000 : false),
  retry: false,
  networkMode: 'always',
});
