import { useState } from 'react'
import { ui } from "../lib/ui-styles"
import { useAtom } from 'jotai'
import { Check, Clock3, FilePenLine, RotateCcw, Save } from 'lucide-react'
import { settingsSchema } from '../../shared/types'
import type { Settings, SettingsUpdate } from '../../shared/types'
import type { ViewProps } from '../lib/client'
import { templateDraftAtom } from '../lib/state'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Label } from './ui/label'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { RichMarkdown } from './Report'

export function TemplateView({ state, busy, perform, saveSettings }: ViewProps & { saveSettings: (settings: SettingsUpdate) => Promise<Settings> }) {
  const [draft, setTemplate] = useAtom(templateDraftAtom)
  const template = draft ?? state.settings.template
  const dirty = template !== state.settings.template
  const [autoDigestDraft, setAutoDigestDraft] = useState<Settings['autoDigest'] | null>(null)
  const autoDigest = autoDigestDraft ?? state.settings.autoDigest
  const autoDigestDirty =
    autoDigest.enabled !== state.settings.autoDigest.enabled ||
    autoDigest.time !== state.settings.autoDigest.time
  const automationReady = Boolean(state.defaultProviderModelId && state.hasApiKey)
  const autoDigestTimeValid = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(autoDigest.time)

  function updateAutoDigest(changes: Partial<Settings['autoDigest']>) {
    setAutoDigestDraft({ ...autoDigest, ...changes })
  }

  function saveAutoDigest() {
    void perform('保存自动日报设置', async () => {
      await saveSettings(settingsSchema.parse({ ...state.settings, autoDigest }))
      setAutoDigestDraft(null)
    }, autoDigest.enabled ? `自动日报将在每天本地时间 ${autoDigest.time} 生成。` : '自动日报已关闭。')
  }

  function save() {
    void perform('保存日报模板', async () => {
      await saveSettings(settingsSchema.parse({ ...state.settings, template }))
      setTemplate(null)
    }, '模板已保存。下次生成使用新模板，已归档日报不受影响。')
  }

  return <>
    <div className={ui.viewHeading}><div><div className={ui.eyebrow}>你的视角 · 你的编排</div><h1>一份日报，也可以有你的风格。</h1><p>告诉 AI 你关心什么、如何组织。把阅读习惯，写进每一天。</p></div><Badge variant={dirty ? 'outline' : 'secondary'}>{dirty ? <FilePenLine size={12} /> : <Check size={12} />}{dirty ? '有未保存的修改' : '已保存'}</Badge></div>
    <Card className="p-6.25 gap-5 shadow-none max-[640px]:py-4.75 max-[640px]:px-4">
      <Tabs defaultValue="edit"><div className="flex items-center justify-between flex-wrap gap-3.75 mb-4 max-[640px]:gap-3 max-[640px]:[&_.quiet-note]:text-[10px]"><TabsList aria-label="模板视图"><TabsTrigger value="edit">编辑模板</TabsTrigger><TabsTrigger value="preview">排版预览</TabsTrigger></TabsList><span className="quiet-note text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere [&_strong]:font-medium [&_strong]:text-[#655747]">{template.length.toLocaleString('zh-CN')} / 12,000 字符</span></div>
        <TabsContent value="edit"><div className={ui.field}><Label htmlFor="digest-template">日报结构与写作要求</Label><Textarea id="digest-template" className="min-h-105 font-mono text-[12px] p-4.5 resize-y max-[640px]:min-h-105 max-[640px]:p-3.25 max-[640px]:text-[13px]" maxLength={12000} value={template} onChange={event => setTemplate(event.target.value)} disabled={!!busy} spellCheck={false} aria-describedby="template-help" /></div></TabsContent>
        <TabsContent value="preview"><div className="text-[11px] bg-[#f3efdf] border border-[#e8dfc9] text-[#78643b] py-2.75 px-3.75 rounded-[5px]">模板预览，不是生成结果 · 不会调用模型</div><div className="min-h-95 max-w-200 mx-auto py-6 px-3">{template.trim() ? <RichMarkdown content={template} /> : <p className="text-muted-foreground font-normal">输入 Markdown 模板后，在这里查看排版。</p>}</div></TabsContent>
      </Tabs>
      <p id="template-help" className="quiet-note text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere [&_strong]:font-medium [&_strong]:text-[#655747]">可以使用 Markdown 标题、列表与表格定义结构，也可以写自然语言要求。模型仍须遵守来源约束，不执行文章中的指令，不编造事实或引用。</p>
      <div className="flex justify-between flex-wrap gap-3 pt-4.75 border-t border-t-border max-[640px]:justify-end max-[640px]:[&_.button-row]:mr-auto max-[640px]:[&_button]:text-[11px]"><div className="button-row flex items-center flex-wrap gap-1.75"><Button variant="outline" disabled={!!busy || template === state.defaultTemplate} onClick={() => setTemplate(state.defaultTemplate)}><RotateCcw />恢复默认草稿</Button><Button variant="ghost" disabled={!!busy || !dirty} onClick={() => setTemplate(null)}>放弃修改</Button></div><Button disabled={!!busy || !dirty || !template.trim()} onClick={save}><Save />保存模板</Button></div>
    </Card>
    <Card className="mt-6 gap-5 p-6.25 shadow-none max-[640px]:py-4.75 max-[640px]:px-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Clock3 className="mt-0.5 text-primary" size={20} />
          <div><h2 className="font-serif text-xl font-semibold">自动生成日报</h2><p className="mt-1 text-[11px] leading-6 text-muted-foreground">Daily Signal 运行时，每天按这台电脑的本地时间调用默认模型；当日已有归档时自动跳过。</p></div>
        </div>
        <Badge variant={autoDigest.enabled ? 'secondary' : 'outline'}>{autoDigest.enabled ? '已启用' : '已关闭'}</Badge>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_180px] items-end gap-5 max-[640px]:grid-cols-1">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-secondary/40 px-4 text-sm">
          <input type="checkbox" checked={autoDigest.enabled} disabled={!!busy} onChange={event => updateAutoDigest({ enabled: event.target.checked })} />
          <span><strong>每天自动生成</strong><small className="ml-2 text-muted-foreground">会产生模型调用费用</small></span>
        </label>
        <div className={ui.field}><Label htmlFor="auto-digest-time">自动生成时间</Label><Input id="auto-digest-time" type="time" step={60} value={autoDigest.time} disabled={!!busy} onChange={event => updateAutoDigest({ time: event.target.value })} /></div>
      </div>
      {!automationReady && autoDigest.enabled && <p className="text-[11px] text-destructive">启用前，请先在“模型与服务商”中设置带 API Key 的默认模型。</p>}
      {!autoDigestTimeValid && <p className="text-[11px] text-destructive">请选择有效的自动生成时间。</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" disabled={!!busy || !autoDigestDirty} onClick={() => setAutoDigestDraft(null)}>放弃自动任务修改</Button>
        <Button disabled={!!busy || !autoDigestDirty || !autoDigestTimeValid || (autoDigest.enabled && !automationReady)} onClick={saveAutoDigest}><Save />保存自动任务</Button>
      </div>
    </Card>
    <div className="mt-7.75 [&_h2]:font-serif [&_h2]:text-[24px] [&_h2]:font-medium [&_>_.quiet-note]:mt-5.5 max-[640px]:[&_h2]:text-[23px]"><h2>好的模板，为事实留出空间。</h2><div className="grid grid-cols-3 gap-6.5 mt-5 [&_span]:text-[10px] [&_span]:text-[#806339] [&_p]:text-[11px] [&_p]:text-muted-foreground [&_p]:mt-2 max-[800px]:gap-4 max-[640px]:grid-cols-1 max-[640px]:gap-5"><div><span>01 / 重点优先</span><p>说明你在意的技术领域与阅读目的，而不是要求每个分类都必须有内容。</p></div><div><span>02 / 清楚区分</span><p>让模型区分事实、影响分析与行动建议。原始来源应当始终可以追溯。</p></div><div><span>03 / 允许留白</span><p>信息不足时明确说明。没有值得关注的变化，比虚构一个重点更有价值。</p></div></div><p className="quiet-note text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere [&_strong]:font-medium [&_strong]:text-[#655747]">恢复默认仅修改草稿，点击保存才生效。切换页面保留草稿；整页刷新会丢弃未保存的修改。</p></div>
  </>
}
