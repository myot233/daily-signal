import { useState } from 'react';
import { useAtom } from 'jotai';
import { Plus, Save } from 'lucide-react';
import { curationSettingsSchema } from '@daily-signal/domain/curation';
import { settingsSchema, type Settings, type SettingsUpdate } from '@daily-signal/domain';
import type { ViewProps } from '@daily-signal/client';
import { curationDraftAtom } from '@daily-signal/client/state';
import { Button } from '@daily-signal/ui/button';
import { Card } from '@daily-signal/ui/card';
import { Input } from '@daily-signal/ui/input';
import { Label } from '@daily-signal/ui/label';
import { Textarea } from '@daily-signal/ui/textarea';

const suggestedTags = [
  'AI',
  '软件工程',
  '开源工具',
  'Rust',
  '前端',
  '数据库',
  '安全',
  '科研',
  '产品设计',
  '商业',
  '硬件',
];

export function CurationSettings({
  state,
  busy,
  perform,
  saveSettings,
}: ViewProps & { saveSettings: (settings: SettingsUpdate) => Promise<Settings> }) {
  const [draft, setDraft] = useAtom(curationDraftAtom);
  const value = draft ?? state.settings.curation;
  const [customTag, setCustomTag] = useState('');
  const [tagError, setTagError] = useState('');
  const choices = [...new Set([...suggestedTags, ...state.settings.curation.tags, ...value.tags])];
  const dirty = JSON.stringify(value) !== JSON.stringify(state.settings.curation);
  const validation = curationSettingsSchema.safeParse(value);

  function update(changes: Partial<Settings['curation']>) {
    setDraft({ ...value, ...changes });
  }
  function toggle(tag: string) {
    setTagError('');
    if (value.tags.includes(tag)) update({ tags: value.tags.filter((item) => item !== tag) });
    else if (value.tags.length < 20) update({ tags: [...value.tags, tag] });
    else setTagError('最多选择 20 个标签。');
  }
  function addTag() {
    const tag = customTag.trim();
    if (!tag) return;
    const existing = choices.find((item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase());
    if (existing) {
      if (!value.tags.includes(existing)) toggle(existing);
    } else toggle(tag);
    setCustomTag('');
  }
  function save() {
    void perform(
      '保存兴趣与筛选',
      async () => {
        await saveSettings(settingsSchema.parse({ ...state.settings, curation: value }));
        setDraft(null);
      },
      '兴趣与筛选已保存。下次生成生效。',
    );
  }

  return (
    <Card className="mb-4 gap-4 p-4 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">兴趣与筛选</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.enabled}
            disabled={!!busy}
            onChange={(event) => update({ enabled: event.target.checked })}
          />
          精选模式
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        {value.enabled
          ? '按标签挑选内容，合并重复事件，生成带原文依据的短卡片。'
          : '使用下方模板汇总当日全部文章。'}
      </p>
      <fieldset disabled={!!busy} className="grid min-w-0 gap-3">
        <legend className="mb-2 text-sm font-medium">兴趣标签</legend>
        <div className="flex flex-wrap gap-2">
          {choices.map((tag) => (
            <Button
              key={tag}
              type="button"
              size="sm"
              variant={value.tags.includes(tag) ? 'default' : 'outline'}
              aria-pressed={value.tags.includes(tag)}
              onClick={() => toggle(tag)}
            >
              {tag}
            </Button>
          ))}
        </div>
        <div className="flex max-w-96 gap-2">
          <Input
            aria-label="自定义兴趣标签"
            placeholder="添加标签，例如：分布式系统"
            maxLength={40}
            value={customTag}
            onChange={(event) => setCustomTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addTag();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!customTag.trim()}
            aria-label="添加兴趣标签"
            onClick={addTag}
          >
            <Plus size={14} />
            添加
          </Button>
        </div>
        {tagError && (
          <p role="alert" className="text-xs text-destructive">
            {tagError}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3 max-[640px]:grid-cols-1">
          <div className="grid gap-1.5">
            <Label htmlFor="curation-items">每日最多条数</Label>
            <Input
              id="curation-items"
              type="number"
              min={1}
              max={20}
              value={value.maxItems}
              onChange={(event) => update({ maxItems: Number(event.target.value) })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="curation-per-tag">每个标签最多条数</Label>
            <Input
              id="curation-per-tag"
              type="number"
              min={1}
              max={20}
              value={value.maxPerCategory}
              onChange={(event) => update({ maxPerCategory: Number(event.target.value) })}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="curation-score">入选门槛（0–10）</Label>
            <Input
              id="curation-score"
              type="number"
              min={0}
              max={10}
              value={value.minScore}
              onChange={(event) => update({ minScore: Number(event.target.value) })}
            />
          </div>
        </div>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">更多偏好</summary>
          <div className="mt-3 grid gap-3">
            <Label htmlFor="curation-preferences">补充要求</Label>
            <Textarea
              id="curation-preferences"
              value={value.interests}
              maxLength={2000}
              onChange={(event) => update({ interests: event.target.value })}
            />
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={value.fetchFullText}
                onChange={(event) => update({ fetchFullText: event.target.checked })}
              />
              为入选内容获取网页正文
            </label>
            <p>仅访问入选文章链接；获取失败时使用订阅摘要。</p>
          </div>
        </details>
      </fieldset>
      {!validation.success && (
        <p role="alert" className="text-xs text-destructive">
          {validation.error.issues[0]?.message}
        </p>
      )}
      <div className="flex justify-end gap-2 border-t pt-3">
        <Button variant="ghost" disabled={!!busy || !dirty} onClick={() => setDraft(null)}>
          放弃筛选修改
        </Button>
        <Button disabled={!!busy || !dirty || !validation.success} onClick={save}>
          <Save />
          保存兴趣与筛选
        </Button>
      </div>
    </Card>
  );
}
