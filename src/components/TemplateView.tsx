import { useAtom } from 'jotai'
import { useMemo } from 'react'
import { Check, FilePenLine, RotateCcw, Save } from 'lucide-react'
import { settingsSchema } from '../../shared/types'
import type { Settings } from '../../shared/types'
import { renderDigestTemplate, templateExampleContext } from '../../shared/template'
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
  const preview = useMemo(() => {
    try { return { content: renderDigestTemplate(template, { ...templateExampleContext, model: state.settings.model }), error: '' } }
    catch (error) { return { content: '', error: error instanceof Error ? error.message : '模板渲染失败。' } }
  }, [template, state.settings.model])

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
        <TabsContent value="preview"><div className="preview-label">使用示例数据：2026-09-10 · 2 篇文章 · 不是生成结果，不会调用模型</div><div className="template-preview">{preview.content.trim() ? <RichMarkdown content={preview.content} /> : <p className="muted">{preview.error ? '请修正模板错误后查看预览。' : '当前示例数据下，模板渲染结果为空。'}</p>}</div></TabsContent>
      </Tabs>
      {preview.error && <p role="alert" className="inline-notice warning">{preview.error}</p>}
      <p id="template-help" className="quiet-note">支持 Markdown、自然语言和 Liquid 模板语法。变量与条件会在生成前渲染。模型仍须遵守来源约束，不编造事实或引用。</p>
      <details><summary>变量与语法示例</summary><p className="quiet-note"><code>{'{{ date }}'}</code> 日报日期；<code>{'{{ articleCount }}'}</code> 去重后文章数；<code>{'{{ model }}'}</code> 模型；<code>startAt</code> / <code>endAt</code> 为 UTC 时间范围（含开始、不含结束）。</p><p className="quiet-note"><code>articles</code> 是去重后的来源列表，每项包含 <code>title</code>、<code>url</code>、<code>feedTitle</code>、<code>publishedAt</code> 和 <code>dateEstimated</code>。预览使用固定示例，生成时使用所选日期的实际数据。</p><pre>{`# {{ date }} 技术日报
{% if articleCount > 10 %}
优先选择最重要的 5 条变化。
{% endif %}
{% for article in articles %}
- {{ article.title }}（{{ article.feedTitle }}）
{% endfor %}`}</pre><p className="quiet-note">按原样显示模板语法时，使用 <code>{'{% raw %}{{ 原样文本 }}{% endraw %}'}</code>。不支持引用外部模板文件。模板最多 12,000 字符，渲染结果最多 30,000 字符。</p></details>
      <div className="editor-footer"><div className="button-row"><Button variant="outline" disabled={!!busy || template === state.defaultTemplate} onClick={() => setTemplate(state.defaultTemplate)}><RotateCcw />恢复默认草稿</Button><Button variant="ghost" disabled={!!busy || !dirty} onClick={() => setTemplate(null)}>放弃修改</Button></div><Button disabled={!!busy || !dirty || !template.trim() || !!preview.error} onClick={save}><Save />保存模板</Button></div>
    </Card>
    <div className="editor-guidance"><h2>好的模板，为事实留出空间。</h2><div className="guidance-grid"><div><span>01 / 重点优先</span><p>说明你在意的技术领域与阅读目的，而不是要求每个分类都必须有内容。</p></div><div><span>02 / 清楚区分</span><p>让模型区分事实、影响分析与行动建议。原始来源应当始终可以追溯。</p></div><div><span>03 / 允许留白</span><p>信息不足时明确说明。没有值得关注的变化，比虚构一个重点更有价值。</p></div></div><p className="quiet-note">恢复默认仅修改草稿，点击保存才生效。切换页面保留草稿；整页刷新会丢弃未保存的修改。</p></div>
  </>
}
