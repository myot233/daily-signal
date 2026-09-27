import { LoaderCircle } from 'lucide-react';
import type { FeedRefreshStatus } from '../../shared/types';

export function FeedRefreshProgress({ value }: { value: FeedRefreshStatus | null | undefined }) {
  if (!value) return null;
  const running = value.status === 'running';
  return (
    <section className="mb-3 rounded-md border bg-card px-3 py-2 text-xs" aria-label="订阅抓取进度">
      <div className="flex flex-wrap items-center gap-2" role="status">
        {running && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}
        <span>
          {running ? '后台抓取文章' : value.status === 'failed' ? '抓取中断' : '抓取完成'}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {value.completed} / {value.total} 个订阅 · 新增 {value.added} 篇 · 失败{' '}
          {value.errors.length} 个
        </span>
      </div>
      {running && (
        <progress
          className="mt-2 h-1 w-full accent-primary"
          aria-label="订阅抓取完成数量"
          max={Math.max(1, value.total)}
          value={value.completed}
        />
      )}
      {value.message && <p className="mt-2 text-muted-foreground">{value.message}</p>}
      {value.errors.length > 0 && (
        <details className="mt-2 text-muted-foreground">
          <summary className="cursor-pointer">失败详情（{value.errors.length}）</summary>
          <ul className="mt-2 space-y-1 wrap-anywhere">
            {value.errors.map((item, index) => (
              <li key={index}>
                {item.url}：{item.error}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
