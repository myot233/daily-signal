import { ui } from '@daily-signal/ui/styles';
import { useState } from 'react';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { formatDate, rpc } from '@daily-signal/client';
import type { View, ViewProps } from '@daily-signal/client';
import type { Digest } from '@daily-signal/domain';
import { Button } from '@daily-signal/ui/button';
import { Card } from '@daily-signal/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@daily-signal/ui/dialog';
import { Report } from './Report';

export function ArchiveView({
  state,
  busy,
  perform,
  navigate,
}: ViewProps & { navigate: (view: View) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Digest | null>(null);
  const selected = state.digests.find((digest) => digest.id === selectedId);
  const digests = [...state.digests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function remove() {
    if (!deleting) return;
    const id = deleting.id;
    if (
      await perform(
        '删除日报',
        async () => {
          await rpc.digests.remove({ id });
        },
        '这份日报已删除。',
      )
    ) {
      if (selectedId === id) setSelectedId(null);
      setDeleting(null);
    }
  }

  return (
    <>
      <div className={ui.viewHeading}>
        <h1>日报归档</h1>
        <span className="text-xs text-muted-foreground">{digests.length} 份</span>
      </div>
      {selected ? (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3 mt-6.5 mx-0 mb-4.25 max-[640px]:mt-5.5 max-[640px]:[&_>_.button-row]:gap-0.5 max-[640px]:[&_button]:text-[11px]">
            <Button variant="ghost" onClick={() => setSelectedId(null)}>
              <ArrowLeft />
              返回归档列表
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => setDeleting(selected)}>
              <Trash2 />
              删除此版本
            </Button>
          </div>
          <Report digest={selected} />
        </>
      ) : digests.length ? (
        <div className="compact-table">
          {digests.map((digest) => (
            <Card
              className="flex-row items-center gap-5.75 p-6 shadow-none max-[640px]:py-4.75 max-[640px]:px-3.75 max-[640px]:gap-3.75 max-[640px]:[&_>_button:last-child]:w-6.5"
              key={digest.id}
            >
              <time
                className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums max-[640px]:w-20"
                dateTime={digest.date}
              >
                {digest.date.replaceAll('-', '.')}
              </time>
              <button
                className="flex-1 min-w-0 text-left [&_h2]:text-sm [&_h2]:font-medium [&_h2]:wrap-anywhere [&:hover_h2]:underline [&_p]:mt-1 [&_p]:text-xs [&_p]:text-muted-foreground [&_p]:wrap-anywhere [&_>_span]:text-xs [&_>_span]:text-muted-foreground"
                onClick={() => setSelectedId(digest.id)}
              >
                <h2>{digest.title}</h2>
                <p>
                  {digest.articleCount} 篇参考文章 · {digest.model}
                  {digest.providerName ? ` · ${digest.providerName}` : ''}
                </p>
                <span>生成于 {formatDate(digest.createdAt, true)}</span>
              </button>
              <Button
                variant="ghost"
                size="icon"
                disabled={!!busy}
                aria-label={`删除 ${digest.title}，生成于 ${formatDate(digest.createdAt, true)}`}
                onClick={() => setDeleting(digest)}
              >
                <Trash2 size={16} />
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <div className={ui.emptyState}>
          <h2>暂无日报</h2>
          <p>生成的日报会保存在这里。</p>
          <Button onClick={() => navigate('today')}>生成日报</Button>
        </div>
      )}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !busy) setDeleting(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>删除这份日报？</DialogTitle>
            <DialogDescription>
              将永久删除「{deleting?.title}」在{' '}
              {deleting ? formatDate(deleting.createdAt, true) : ''}{' '}
              生成的版本及其来源快照。其他版本、订阅与文章不会受影响。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={!!busy} onClick={() => setDeleting(null)}>
              保留日报
            </Button>
            <Button variant="destructive" disabled={!!busy} onClick={() => void remove()}>
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
