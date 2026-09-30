import { ui } from '@daily-signal/ui/styles';
import { useAtom } from 'jotai';
import { Check, FilePenLine, RotateCcw, Save } from 'lucide-react';
import { settingsSchema } from '@daily-signal/domain';
import type { Settings, SettingsUpdate } from '@daily-signal/domain';
import type { ViewProps } from '@daily-signal/client';
import { templateDraftAtom } from '@daily-signal/client/state';
import { Button } from '@daily-signal/ui/button';
import { Card } from '@daily-signal/ui/card';
import { Badge } from '@daily-signal/ui/badge';
import { Label } from '@daily-signal/ui/label';
import { Textarea } from '@daily-signal/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@daily-signal/ui/tabs';
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
    </>
  );
}
