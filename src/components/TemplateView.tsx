import { useState } from 'react';
import { ui } from '../lib/ui-styles';
import { useAtom } from 'jotai';
import { Check, Clock3, FilePenLine, RotateCcw, Save } from 'lucide-react';
import { settingsSchema } from '../../shared/types';
import type { Settings, SettingsUpdate } from '../../shared/types';
import type { ViewProps } from '../lib/client';
import { templateDraftAtom } from '../lib/state';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { RichMarkdown } from './Report';
import { CurationSettings } from './CurationSettings';

export function TemplateView({
  state,
  busy,
  perform,
  saveSettings,
  notify,
}: ViewProps & { saveSettings: (settings: SettingsUpdate) => Promise<Settings> }) {
  const [draft, setTemplate] = useAtom(templateDraftAtom);
  const template = draft ?? state.settings.template;
  const dirty = template !== state.settings.template;
  const [autoDigestDraft, setAutoDigestDraft] = useState<Settings['autoDigest'] | null>(null);
  const autoDigest = autoDigestDraft ?? state.settings.autoDigest;
  const autoDigestDirty =
    autoDigest.enabled !== state.settings.autoDigest.enabled ||
    autoDigest.time !== state.settings.autoDigest.time;
  const automationReady = Boolean(state.defaultProviderModelId && state.hasApiKey);
  const autoDigestTimeValid = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(autoDigest.time);

  function updateAutoDigest(changes: Partial<Settings['autoDigest']>) {
    setAutoDigestDraft({ ...autoDigest, ...changes });
  }

  function saveAutoDigest() {
    void perform(
      '保存自动日报设置',
      async () => {
        await saveSettings(settingsSchema.parse({ ...state.settings, autoDigest }));
        setAutoDigestDraft(null);
      },
      autoDigest.enabled
        ? `自动日报将在每天本地时间 ${autoDigest.time} 生成。`
        : '自动日报已关闭。',
    );
  }

  function save() {
    void perform(
      '保存日报模板',
      async () => {
        await saveSettings(settingsSchema.parse({ ...state.settings, template }));
        setTemplate(null);
      },
      '模板已保存。下次生成使用新模板，已归档日报不受影响。',
    );
  }

  return (
    <>
      <div className={ui.viewHeading}>
        <h1>日报设置</h1>
        <Badge variant={dirty ? 'outline' : 'secondary'}>
          {dirty ? <FilePenLine size={12} /> : <Check size={12} />}
          {dirty ? '有未保存的修改' : '已保存'}
        </Badge>
      </div>
      <CurationSettings
        state={state}
        busy={busy}
        perform={perform}
        saveSettings={saveSettings}
        notify={notify}
      />
      {state.settings.curation.enabled && (
        <p className="mb-3 text-xs text-muted-foreground">
          以下模板仅用于关闭精选模式后的全文日报。
        </p>
      )}
      <Card className="p-4 gap-3 shadow-none max-[640px]:py-4.75 max-[640px]:px-4">
        <Tabs defaultValue="edit">
          <div className="flex items-center justify-between flex-wrap gap-3.75 mb-4 max-[640px]:gap-3 max-[640px]:[&_.quiet-note]:text-[10px]">
            <TabsList aria-label="模板视图">
              <TabsTrigger value="edit">编辑模板</TabsTrigger>
              <TabsTrigger value="preview">排版预览</TabsTrigger>
            </TabsList>
            <span className="quiet-note text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere [&_strong]:font-medium [&_strong]:text-[#655747]">
              {template.length.toLocaleString('zh-CN')} / 12,000 字符
            </span>
          </div>
          <TabsContent value="edit">
            <div className={ui.field}>
              <Label htmlFor="digest-template">日报结构与写作要求</Label>
              <Textarea
                id="digest-template"
                className="min-h-105 font-mono text-[12px] p-4.5 resize-y max-[640px]:min-h-105 max-[640px]:p-3.25 max-[640px]:text-[13px]"
                maxLength={12000}
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                disabled={!!busy}
                spellCheck={false}
                aria-describedby="template-help"
              />
            </div>
          </TabsContent>
          <TabsContent value="preview">
            <div className="text-[11px] bg-[#f3efdf] border border-[#e8dfc9] text-[#78643b] py-2.75 px-3.75 rounded-[5px]">
              模板预览，不是生成结果 · 不会调用模型
            </div>
            <div className="min-h-95 max-w-200 mx-auto py-6 px-3">
              {template.trim() ? (
                <RichMarkdown content={template} />
              ) : (
                <p className="text-muted-foreground font-normal">
                  输入 Markdown 模板后，在这里查看排版。
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <p
          id="template-help"
          className="quiet-note text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere [&_strong]:font-medium [&_strong]:text-[#655747]"
        >
          支持 Markdown。保存后生效；刷新会丢弃未保存修改。
        </p>
        <div className="flex justify-between flex-wrap gap-3 pt-4.75 border-t border-t-border max-[640px]:justify-end max-[640px]:[&_.button-row]:mr-auto max-[640px]:[&_button]:text-[11px]">
          <div className="button-row flex items-center flex-wrap gap-1.75">
            <Button
              variant="outline"
              disabled={!!busy || template === state.defaultTemplate}
              onClick={() => setTemplate(state.defaultTemplate)}
            >
              <RotateCcw />
              恢复默认草稿
            </Button>
            <Button variant="ghost" disabled={!!busy || !dirty} onClick={() => setTemplate(null)}>
              放弃修改
            </Button>
          </div>
          <Button disabled={!!busy || !dirty || !template.trim()} onClick={save}>
            <Save />
            保存模板
          </Button>
        </div>
      </Card>
      <Card className="mt-4 gap-3 p-4 shadow-none max-[640px]:py-4.75 max-[640px]:px-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 text-primary" size={20} />
            <div>
              <h2 className="text-sm font-semibold">自动生成日报</h2>
              <p className="mt-1 text-[11px] leading-6 text-muted-foreground">
                应用运行时按本地时间生成，当天已有日报则跳过。
              </p>
            </div>
          </div>
          <Badge variant={autoDigest.enabled ? 'secondary' : 'outline'}>
            {autoDigest.enabled ? '已启用' : '已关闭'}
          </Badge>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_180px] items-end gap-5 max-[640px]:grid-cols-1">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-secondary/40 px-4 text-sm">
            <input
              type="checkbox"
              checked={autoDigest.enabled}
              disabled={!!busy}
              onChange={(event) => updateAutoDigest({ enabled: event.target.checked })}
            />
            <span>
              <strong>每天自动生成</strong>
              <small className="ml-2 text-muted-foreground">会产生模型调用费用</small>
            </span>
          </label>
          <div className={ui.field}>
            <Label htmlFor="auto-digest-time">自动生成时间</Label>
            <Input
              id="auto-digest-time"
              type="time"
              step={60}
              value={autoDigest.time}
              disabled={!!busy}
              onChange={(event) => updateAutoDigest({ time: event.target.value })}
            />
          </div>
        </div>
        {!automationReady && autoDigest.enabled && (
          <p className="text-[11px] text-destructive">
            启用前，请先在“模型与服务商”中设置带 API Key 的默认模型。
          </p>
        )}
        {!autoDigestTimeValid && (
          <p className="text-[11px] text-destructive">请选择有效的自动生成时间。</p>
        )}
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button
            variant="ghost"
            disabled={!!busy || !autoDigestDirty}
            onClick={() => setAutoDigestDraft(null)}
          >
            放弃自动任务修改
          </Button>
          <Button
            disabled={
              !!busy ||
              !autoDigestDirty ||
              !autoDigestTimeValid ||
              (autoDigest.enabled && !automationReady)
            }
            onClick={saveAutoDigest}
          >
            <Save />
            保存自动任务
          </Button>
        </div>
      </Card>
    </>
  );
}
