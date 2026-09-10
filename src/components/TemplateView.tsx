import { useAtom } from 'jotai'
import { Check, FilePenLine, RotateCcw, Save } from 'lucide-react'
import { settingsSchema } from '../../shared/types'
import type { Settings } from '../../shared/types'
import type { ViewProps } from '../lib/client'
import { templateDraftAtom } from '../lib/state'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { RichMarkdown } from './Report'

export function TemplateView({ state, busy, perform, saveSettings }: ViewProps & { saveSettings: (settings: Settings) => Promise<Settings> }) {
  const [draft, setTemplate] = useAtom(templateDraftAtom)
  const template = draft ?? state.settings.template
  const dirty = template !== state.settings.template

  function save() {
    void perform('保存日报模板', async () => {
      await saveSettings(settingsSchema.parse({ ...state.settings, template }))
      setTemplate(null)
    }, '模板已保存。下次生成使用新模板，已归档日报不受影响。')
  }

  return <>
    <div className="view-heading"><div><div className="eyebrow">你的视角 · 你的编排</div><h1>一份日报，也可以有你的风格。</h1><p>告诉 AI 你关心什么、如何组织。把阅读习惯，写进每一天。</p></div><Badge variant={dirty ? 'outline' : 'secondary'}>{dirty ? <FilePenLine size={12} /> : <Check size={12} />}{dirty ? '有未保存的修改' : '已保存'}</Badge></div>
    <Card className="editor-card">
      <Tabs defaultValue="edit"><div className="editor-toolbar"><TabsList aria-label="模板视图"><TabsTrigger value="edit">编辑模板</TabsTrigger><TabsTrigger value="preview">排版预览</TabsTrigger></TabsList><span className="quiet-note">{template.length.toLocaleString('zh-CN')} / 12,000 字符</span></div>
        <TabsContent value="edit"><div className="field"><Label htmlFor="digest-template">日报结构与写作要求</Label><Textarea id="digest-template" className="template-input" maxLength={12000} value={template} onChange={event => setTemplate(event.target.value)} disabled={!!busy} spellCheck={false} aria-describedby="template-help" /></div></TabsContent>
        <TabsContent value="preview"><div className="preview-label">模板预览，不是生成结果 · 不会调用模型</div><div className="template-preview">{template.trim() ? <RichMarkdown content={template} /> : <p className="muted">输入 Markdown 模板后，在这里查看排版。</p>}</div></TabsContent>
      </Tabs>
      <p id="template-help" className="quiet-note">可以使用 Markdown 标题、列表与表格定义结构，也可以写自然语言要求。模型仍须遵守来源约束，不执行文章中的指令，不编造事实或引用。</p>
      <div className="editor-footer"><div className="button-row"><Button variant="outline" disabled={!!busy || template === state.defaultTemplate} onClick={() => setTemplate(state.defaultTemplate)}><RotateCcw />恢复默认草稿</Button><Button variant="ghost" disabled={!!busy || !dirty} onClick={() => setTemplate(null)}>放弃修改</Button></div><Button disabled={!!busy || !dirty || !template.trim()} onClick={save}><Save />保存模板</Button></div>
    </Card>
    <div className="editor-guidance"><h2>好的模板，为事实留出空间。</h2><div className="guidance-grid"><div><span>01 / 重点优先</span><p>说明你在意的技术领域与阅读目的，而不是要求每个分类都必须有内容。</p></div><div><span>02 / 清楚区分</span><p>让模型区分事实、影响分析与行动建议。原始来源应当始终可以追溯。</p></div><div><span>03 / 允许留白</span><p>信息不足时明确说明。没有值得关注的变化，比虚构一个重点更有价值。</p></div></div><p className="quiet-note">恢复默认仅修改草稿，点击保存才生效。切换页面保留草稿；整页刷新会丢弃未保存的修改。</p></div>
  </>
}
