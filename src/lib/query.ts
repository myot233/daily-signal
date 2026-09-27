import { queryOptions } from '@tanstack/react-query';
import { rpc } from './client';

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
