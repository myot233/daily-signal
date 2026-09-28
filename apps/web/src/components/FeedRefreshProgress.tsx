import { LoaderCircle } from 'lucide-react';
import type { FeedRefreshStatus } from '@daily-signal/domain';

export function FeedRefreshProgress({ value }: { value: FeedRefreshStatus | null | undefined }) {
  if (!value || value.status === 'completed') return null;
  if (value.status === 'failed') {
    return (
      <span className="text-xs text-destructive" role="alert" title={value.message ?? undefined}>
        抓取中断，请重试
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
      <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
      抓取中{' '}
      <span className="tabular-nums">
        {value.completed}/{value.total}
      </span>
    </span>
  );
}
