import { queryOptions } from '@tanstack/react-query';
import { rpc } from './client';

export const appStateQueryOptions = queryOptions({
  queryKey: ['app-state'],
  queryFn: () => rpc.state(),
  retry: false,
  staleTime: 30_000,
  networkMode: 'always',
});
