import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { Link } from 'react-router';
import { ArrowRight, Check, Clock3, FilePenLine, RefreshCw, Save } from 'lucide-react';
import { automationSettingsSchema, feedRefreshSettingsSchema } from '@daily-signal/domain';
import type { AutomationSettings, Settings } from '@daily-signal/domain';
import type { ViewProps } from '@daily-signal/client';
import { automationDraftAtom } from '@daily-signal/client/state';
import { ui } from '@daily-signal/ui/styles';
import { Badge } from '@daily-signal/ui/badge';
import { Button } from '@daily-signal/ui/button';
import { Card } from '@daily-signal/ui/card';
import { Input } from '@daily-signal/ui/input';
import { Label } from '@daily-signal/ui/label';
import { SettingsNavigation } from './SettingsNavigation';

export function GeneralSettingsView({
  state,
  busy,
  perform,
  saveAutomation,
}: ViewProps & { saveAutomation: (settings: AutomationSettings) => Promise<Settings> }) {
  const [draft, setDraft] = useAtom(automationDraftAtom);
  const saved = { autoDigest: state.settings.autoDigest, feedRefresh: state.settings.feedRefresh };
  const value = draft ?? saved;
  const dirty =
    value.autoDigest.enabled !== saved.autoDigest.enabled ||
    value.autoDigest.time !== saved.autoDigest.time ||
    value.feedRefresh.intervalMinutes !== saved.feedRefresh.intervalMinutes;
  const provider = state.providers.find((connection) =>
    connection.models.some((model) => model.id === state.defaultProviderModelId),
  );
  const model = provider?.models.find((model) => model.id === state.defaultProviderModelId);
  const ready = Boolean(provider?.enabled && provider.hasCredential && model?.enabled);
  const valid = automationSettingsSchema.safeParse(value).success;
  const canSave = dirty && valid && (!value.autoDigest.enabled || ready);

  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);

  function save() {
    if (busy || !canSave) return;
    void perform(
      '保存设置',
      async () => {
        await saveAutomation(automationSettingsSchema.parse(value));
        setDraft(null);
      },
      '设置已保存，自动任务已更新。',
    );
  }

  return (
    <>
      <div className={ui.viewHeading}>
        <h1>设置</h1>
        <Badge variant={dirty ? 'outline' : 'secondary'}>
          {dirty ? <FilePenLine size={12} /> : <Check size={12} />}
          {dirty ? '有未保存的修改' : '已保存'}
        </Badge>
      </div>
      <SettingsNavigation />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        className="grid gap-4"
      >
        <Card className="gap-4 p-4 shadow-none">
          <div className={ui.cardHeading}>
            <RefreshCw className="shrink-0 text-primary" size={18} />
            <div>
              <h2>订阅自动刷新</h2>
              <p className="mt-1 leading-6">定期获取所有订阅的新文章。</p>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_200px] items-center gap-4 max-[640px]:grid-cols-1">
            <p className="text-xs leading-6 text-muted-foreground">
              保存后从下一周期开始；正在抓取或导入时跳过本次，手动刷新仍可使用。
            </p>
            <div className={ui.field}>
              <Label htmlFor="feed-refresh-interval">刷新频率</Label>
              <select
                id="feed-refresh-interval"
                className="h-10 w-full rounded-md border border-input bg-paper px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                value={value.feedRefresh.intervalMinutes}
                disabled={!!busy}
                onChange={(event) =>
                  setDraft({
                    ...value,
                    feedRefresh: feedRefreshSettingsSchema.parse({
                      intervalMinutes: Number(event.target.value),
                    }),
                  })
                }
              >
                <option value={0}>关闭，仅手动刷新</option>
                <option value={15}>每 15 分钟</option>
                <option value={30}>每 30 分钟</option>
                <option value={60}>每小时</option>
                <option value={120}>每 2 小时</option>
                <option value={240}>每 4 小时</option>
              </select>
            </div>
          </div>
        </Card>

        <Card className="gap-4 p-4 shadow-none">
          <div className={ui.cardHeading}>
            <Clock3 className="shrink-0 text-primary" size={18} />
            <div>
              <h2>每日自动生成</h2>
              <p className="mt-1 leading-6">按本机本地时间生成当天日报，当天已有归档则跳过。</p>
            </div>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_200px] items-end gap-4 max-[640px]:grid-cols-1">
            <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={value.autoDigest.enabled}
                disabled={!!busy}
                onChange={(event) =>
                  setDraft({
                    ...value,
                    autoDigest: {
                      enabled: event.target.checked,
                      time:
                        !event.target.checked && !valid
                          ? saved.autoDigest.time
                          : value.autoDigest.time,
                    },
                  })
                }
              />
              每天自动生成日报
            </label>
            <div className={ui.field}>
              <Label htmlFor="auto-digest-time">自动生成时间</Label>
              <Input
                id="auto-digest-time"
                type="time"
                step={60}
                value={value.autoDigest.time}
                disabled={!!busy || !value.autoDigest.enabled}
                onChange={(event) =>
                  setDraft({
                    ...value,
                    autoDigest: { ...value.autoDigest, time: event.target.value },
                  })
                }
              />
            </div>
          </div>
          <div className="border-t pt-3 text-xs leading-6 text-muted-foreground">
            <p>
              默认模型：
              {model && provider
                ? `${provider.name} / ${model.displayName ?? model.modelId}`
                : '尚未选择'}
              。 生成会使用已保存的兴趣筛选和模板，并产生模型调用费用。
            </p>
            {!ready && (
              <p
                role={value.autoDigest.enabled ? 'alert' : undefined}
                className={value.autoDigest.enabled ? 'text-destructive' : ''}
              >
                启用前，请先选择已启用且保存了 API Key 的默认模型。
              </p>
            )}
            {!valid && (
              <p role="alert" className="text-destructive">
                请选择有效的自动生成时间。
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              <Link
                to="/settings/providers"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
              >
                管理模型与服务商 <ArrowRight size={12} />
              </Link>
              <Link
                to="/template"
                className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
              >
                编辑兴趣筛选与模板 <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs leading-6 text-muted-foreground">
            仅在应用运行时执行，关闭期间的任务不补跑。
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={!!busy || !dirty}
              onClick={() => setDraft(null)}
            >
              放弃修改
            </Button>
            <Button type="submit" disabled={!!busy || !canSave}>
              <Save />
              保存设置
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
