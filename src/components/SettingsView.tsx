import { differenceBy } from 'es-toolkit/array';
import { useEffect, useMemo, useRef, useState } from 'react';
import { unstable_usePrompt, useLocation, useNavigate, useParams } from 'react-router';
import {
  ArrowLeft, Check, ChevronRight, CircleAlert, FlaskConical, KeyRound, LoaderCircle,
  Plus, RefreshCw, Save, Search, Settings2, ShieldCheck, Trash2,
} from 'lucide-react';
import { providerCatalog, protocolLabels } from '../../shared/providers/catalog';
import { providerCreateSchema, providerModelSaveSchema, providerUpdateSchema } from '../../shared/providers/schemas';
import type { ProviderConnection, ProviderOptions } from '../../shared/providers/schemas';
import { shouldDiscardProviderDraft } from '../../shared/providers/draft-state';
import type { ViewProps } from '../lib/client';
import { rpc } from '../lib/client';
import { ui } from '../lib/ui-styles';
import { ProviderIcon } from './ProviderIcon';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

type ConnectionDraft = {
  name: string;
  baseUrl: string;
  protocol: ProviderConnection['protocol'];
  enabled: boolean;
  options: ProviderOptions;
  credential: string | null;
};

const fieldClass = 'grid gap-2 [&_label]:text-[12px] [&_p]:text-[11px] [&_p]:leading-[1.8] [&_p]:text-muted-foreground';
const selectClass = 'h-10 w-full rounded-md border border-input bg-paper px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50';

function draftFor(provider: ProviderConnection): ConnectionDraft {
  return { name: provider.name, baseUrl: provider.baseUrl, protocol: provider.protocol, enabled: provider.enabled, options: provider.options, credential: '' };
}

function sameDraft(provider: ProviderConnection, draft: ConnectionDraft): boolean {
  return provider.name === draft.name && provider.baseUrl === draft.baseUrl && provider.protocol === draft.protocol
    && provider.enabled === draft.enabled && JSON.stringify(provider.options) === JSON.stringify(draft.options)
    && draft.credential === '';
}

export function SettingsView({ state, busy, perform, notify }: ViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { providerId } = useParams();
  const [draftState, setDraftState] = useState<{ id: string; revision: number; value: ConnectionDraft } | null>(null);
  const fallback = state.providers.find(provider => provider.models.some(model => model.id === state.defaultProviderModelId)) ?? state.providers[0];
  const draftProvider = draftState ? state.providers.find(provider => provider.id === draftState.id) : undefined;
  const selected = providerId ? state.providers.find(provider => provider.id === providerId) : draftProvider ?? fallback;
  const draft = selected && draftState?.id === selected.id ? draftState.value : selected ? draftFor(selected) : null;
  const dirty = Boolean(selected && draft && !sameDraft(selected, draft));
  unstable_usePrompt({ when: dirty, message: '当前连接有未保存修改。确定放弃并离开吗？' });
  const [addOpen, setAddOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [testState, setTestState] = useState<{ providerId: string; modelId: string } | null>(null);
  const [discoveryState, setDiscoveryState] = useState<{ providerId: string; models: Array<{ modelId: string; displayName: string | null }> } | null>(null);
  const [manualState, setManualState] = useState<{ providerId: string; modelId: string; name: string } | null>(null);
  const [connectionSearch, setConnectionSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const discoveries = selected && discoveryState?.providerId === selected.id ? discoveryState.models : [];
  const manualModel = selected && manualState?.providerId === selected.id ? manualState.modelId : '';
  const manualName = selected && manualState?.providerId === selected.id ? manualState.name : '';
  const testModel = selected && testState?.providerId === selected.id ? testState.modelId : null;
  const visibleProviders = state.providers.filter(provider => `${provider.name} ${provider.baseUrl}`.toLowerCase().includes(connectionSearch.trim().toLowerCase()));
  const availableModels = useMemo(() => state.providers.flatMap(provider => provider.enabled
    ? provider.models.filter(model => model.enabled).map(model => ({ provider, model })) : []), [state.providers]);
  const defaultChoice = availableModels.find(item => item.model.id === state.defaultProviderModelId);
  const previousLocationKey = useRef(location.key);

  useEffect(() => {
    const prevent = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  useEffect(() => {
    const discard = shouldDiscardProviderDraft({
      draftProviderId: draftState?.id ?? null,
      selectedProviderId: selected?.id ?? null,
      previousLocationKey: previousLocationKey.current,
      currentLocationKey: location.key,
    });
    previousLocationKey.current = location.key;
    if (discard) setDraftState(null);
  }, [draftState?.id, location.key, selected?.id]);

  function updateDraft(changes: Partial<ConnectionDraft>) {
    if (!selected || !draft) return;
    setDraftState({ id: selected.id, revision: draftState?.id === selected.id ? draftState.revision : selected.revision, value: { ...draft, ...changes } });
  }
  function updateOptions(changes: Partial<ProviderOptions>) {
    if (draft) updateDraft({ options: { ...draft.options, ...changes } });
  }
  function chooseProvider(id: string) {
    void navigate(`/settings/providers/${id}`);
  }
  function save() {
    if (!selected || !draft) return;
    void perform('保存连接', async () => {
      await rpc.providers.update(providerUpdateSchema.parse({
        id: selected.id, revision: draftState?.id === selected.id ? draftState.revision : selected.revision, presetId: selected.presetId,
        name: draft.name, protocol: draft.protocol, baseUrl: draft.baseUrl, enabled: draft.enabled,
        options: draft.options, credential: draft.credential === '' ? undefined : draft.credential,
      }));
      setDraftState(null);
    }, '连接已保存。地址或协议变更时，未重新填写的旧 Key 会被清除。');
  }
  function setDefault(providerModelId: string | null) {
    void perform('切换默认模型', async () => { await rpc.defaultModel.set({ providerModelId }); }, providerModelId ? '日报默认模型已更新，下次生成生效。' : '日报默认模型已清空。');
  }
  function saveModel(modelId: string, displayName: string | null, source: 'manual' | 'discovered' = 'manual') {
    if (!selected) return;
    void perform('保存模型', async () => {
      await rpc.providerModels.save(providerModelSaveSchema.parse({ providerId: selected.id, modelId, displayName, enabled: true, source }));
      setManualState({ providerId: selected.id, modelId: '', name: '' });
    }, '模型已加入这条连接。');
  }
  function discover() {
    if (!selected) return;
    void perform('获取模型目录', async () => {
      const result = await rpc.providers.discoverModels({ id: selected.id });
      setDiscoveryState({ providerId: selected.id, models: differenceBy(result.models, selected.models, model => model.modelId) });
      notify({ kind: 'success', message: `找到 ${result.models.length} 个模型候选；选择后才会保存。` });
    });
  }
  function clearCredential() {
    if (!selected || !draft) return;
    updateDraft({ credential: null });
  }

  return <>
    <div className={ui.viewHeading}>
      <div><div className={ui.eyebrow}>自带密钥 · 多连接</div><h1>模型与服务商</h1><p>管理真实连接、准确模型 ID 与下一次生成使用的默认项。</p></div>
      <Button className="min-h-11" onClick={() => setAddOpen(true)}><Plus />添加服务商</Button>
    </div>

    <Card className="mb-6 flex-row items-center justify-between gap-5 p-5 shadow-none max-[700px]:items-start max-[700px]:flex-col">
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-secondary">{defaultChoice ? <ProviderIcon presetId={defaultChoice.provider.presetId} /> : <CircleAlert size={20} />}</span>
        <div className="min-w-0"><p className="text-[10px] tracking-[.12em] text-muted-foreground">日报默认模型 · 下次生成生效</p><strong className="mt-1 block truncate text-sm">{defaultChoice ? (defaultChoice.model.displayName || defaultChoice.model.modelId) : '尚未选择'}</strong><span className="text-[11px] text-muted-foreground">{defaultChoice?.provider.name ?? '生成前需要选择连接与模型'}</span></div>
      </div>
      <select className={`${selectClass} max-w-85`} aria-label="日报默认模型" value={state.defaultProviderModelId ?? ''} disabled={!!busy} onChange={event => setDefault(event.target.value || null)}>
        <option value="">不设置默认模型</option>
        {state.providers.filter(provider => provider.enabled).map(provider => <optgroup key={provider.id} label={provider.name}>{provider.models.filter(model => model.enabled).map(model => <option key={model.id} value={model.id}>{model.displayName || model.modelId}</option>)}</optgroup>)}
      </select>
    </Card>

    <div className="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-6 max-[900px]:grid-cols-1">
      <aside className={`rounded-xl border bg-card p-3 max-[900px]:p-2 ${providerId ? 'max-[900px]:hidden' : ''}`} aria-label="连接列表">
        <div className="px-2 py-2 text-[10px] font-semibold tracking-[.14em] text-muted-foreground">连接 · {state.providers.length}</div>
        <div className="relative mb-2"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="搜索连接" className="pl-9" placeholder="搜索名称或地址" value={connectionSearch} onChange={event => setConnectionSearch(event.target.value)} /></div>
        <div className="grid gap-1.5">{visibleProviders.map(provider => {
          const isSelected = provider.id === selected?.id;
          const isDefault = provider.models.some(model => model.id === state.defaultProviderModelId);
          return <button key={provider.id} type="button" onClick={() => chooseProvider(provider.id)} className={`flex min-h-15 w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 ${isSelected ? 'border-[#d9c5ac] bg-[#faf5ec]' : 'border-transparent hover:bg-secondary'}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-background"><ProviderIcon presetId={provider.presetId} size={21} /></span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-[13px]">{provider.name}</strong><span className="mt-0.5 flex gap-1.5 text-[10px] text-muted-foreground">{provider.models.length} 个模型 · {provider.enabled ? (provider.hasCredential ? '已配置' : '缺少 Key') : '已停用'}{isDefault ? ' · 默认' : ''}</span></span><ChevronRight size={15} aria-hidden="true" />
          </button>;
        })}</div>
        {!state.providers.length && <div className="px-3 py-8 text-center text-xs leading-7 text-muted-foreground">还没有连接。添加服务商后，可保存 Key 与模型。</div>}
        {state.providers.length > 0 && !visibleProviders.length && <div className="px-3 py-8 text-center text-xs text-muted-foreground">没有匹配的连接。</div>}
      </aside>

      {selected && draft ? <section className={`min-w-0 ${!providerId ? 'max-[900px]:hidden' : ''}`}>
        <div className="mb-4 flex items-center justify-between gap-4 max-[640px]:items-start">
          <div className="flex min-w-0 items-center gap-3"><Button className="hidden max-[900px]:inline-flex" variant="ghost" size="icon" aria-label="返回连接列表" onClick={() => void navigate('/settings')}><ArrowLeft /></Button><span className="grid size-12 shrink-0 place-items-center rounded-xl border bg-card"><ProviderIcon presetId={selected.presetId} size={28} /></span><div className="min-w-0"><h2 className="truncate font-serif text-[24px] font-semibold">{selected.name}</h2><p className="truncate font-mono text-[10px] text-muted-foreground">{selected.baseUrl}</p></div></div>
          <Badge variant={dirty ? 'outline' : selected.enabled ? 'secondary' : 'outline'}>{dirty ? '有未保存修改' : selected.enabled ? '已启用' : '已停用'}</Badge>
        </div>
        <Tabs defaultValue="connection">
          <TabsList variant="line" className="mb-4 w-full justify-start border-b"><TabsTrigger value="connection" className="min-h-11 flex-none px-4">连接配置</TabsTrigger><TabsTrigger value="models" className="min-h-11 flex-none px-4">可用模型 <span className="text-[10px]">{selected.models.length}</span></TabsTrigger></TabsList>
          <TabsContent value="connection"><Card className="gap-6 p-6 shadow-none max-[640px]:p-4.5">
            <div className="flex items-start gap-3"><Settings2 className="mt-0.5 text-primary" size={20} /><div><h3 className="font-serif text-xl font-semibold">基础连接</h3><p className="mt-1 text-[11px] leading-6 text-muted-foreground">凭据只保存在服务器数据库，公共 API 仅返回是否已配置。</p></div></div>
            <form className="grid gap-5" onSubmit={event => { event.preventDefault(); save(); }}>
              <div className="grid grid-cols-2 gap-5 max-[640px]:grid-cols-1"><div className={fieldClass}><Label htmlFor="provider-name">连接名称</Label><Input id="provider-name" required maxLength={100} value={draft.name} disabled={!!busy} onChange={event => updateDraft({ name: event.target.value })} /></div><div className={fieldClass}><Label htmlFor="provider-protocol">实际对外协议</Label><select id="provider-protocol" className={selectClass} value={draft.protocol} disabled={!!busy || (selected.presetId !== 'custom' && providerCatalog.find(item => item.id === selected.presetId)?.protocols.length === 1)} onChange={event => updateDraft({ protocol: event.target.value as ConnectionDraft['protocol'] })}>{(selected.presetId === 'custom' ? Object.entries(protocolLabels) : providerCatalog.find(item => item.id === selected.presetId)?.protocols.map(protocol => [protocol, protocolLabels[protocol]] as const) ?? []).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>
              <div className={fieldClass}><Label htmlFor="provider-base-url">Base URL</Label><Input id="provider-base-url" type="url" required maxLength={2000} value={draft.baseUrl} disabled={!!busy} onChange={event => updateDraft({ baseUrl: event.target.value })} /><p>填写公开 HTTPS API 根地址，不要包含 /responses、/chat/completions、/messages 或 :generateContent。</p></div>
              <div className={fieldClass}><Label htmlFor="provider-key">API Key</Label><Input id="provider-key" type="password" autoComplete="off" maxLength={4096} value={draft.credential ?? ''} disabled={!!busy} placeholder={draft.credential === null ? '保存后清除 Key' : selected.hasCredential ? '已保存，留空保留原 Key' : '输入服务商 API Key'} onChange={event => updateDraft({ credential: event.target.value })} /><p><KeyRound className="mr-1 inline size-3.5" />输入新值会替换；修改地址或协议时必须重新输入，否则旧 Key 会被清除。</p>{selected.hasCredential && draft.credential !== null && <Button className="w-fit" type="button" variant="ghost" size="sm" disabled={!!busy} onClick={clearCredential}><Trash2 />标记为清除</Button>}{draft.credential === null && <p className="text-destructive">保存连接后才会清除 Key；放弃修改可撤销。</p>}</div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-secondary/40 px-4 text-sm"><input type="checkbox" checked={draft.enabled} disabled={!!busy} onChange={event => updateDraft({ enabled: event.target.checked })} /><span><strong>启用这条连接</strong><small className="ml-2 text-muted-foreground">停用后不出现在生成选择中</small></span></label>
              <details className="rounded-lg border bg-[#fbfaf5] p-4"><summary className="cursor-pointer text-sm font-semibold">高级参数</summary><div className="mt-5 grid grid-cols-2 gap-5 max-[640px]:grid-cols-1">
                <div className={fieldClass}><Label htmlFor="provider-timeout">请求超时（毫秒）</Label><Input id="provider-timeout" type="number" min={5000} max={600000} disabled={!!busy} value={draft.options.timeoutMs} onChange={event => updateOptions({ timeoutMs: Number(event.target.value) })} /></div>
                <div className={fieldClass}><Label htmlFor="provider-output">输出上限（tokens）</Label><Input id="provider-output" type="number" min={32} max={65536} disabled={!!busy} value={draft.options.maxOutputTokens} onChange={event => updateOptions({ maxOutputTokens: Number(event.target.value) })} /></div>
                {(draft.protocol === 'openai-responses' || draft.protocol === 'openai-chat-completions') && <div className={fieldClass}><Label htmlFor="provider-reasoning">Reasoning effort</Label><select id="provider-reasoning" className={selectClass} disabled={!!busy} value={draft.options.reasoningEffort ?? ''} onChange={event => updateOptions({ reasoningEffort: event.target.value ? event.target.value as ProviderOptions['reasoningEffort'] : undefined })}><option value="">不发送</option>{['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(value => <option key={value} value={value}>{value}</option>)}</select><p>候选与当前 SDK 对齐，是否支持由实际模型决定。</p></div>}
                {selected.presetId === 'deepseek' && <div className={fieldClass}><Label htmlFor="provider-deepseek">DeepSeek 思考</Label><select id="provider-deepseek" className={selectClass} disabled={!!busy} value={draft.options.deepseekThinking} onChange={event => { const enabled = event.target.value === 'enabled'; updateOptions({ deepseekThinking: enabled ? 'enabled' : 'disabled', maxOutputTokens: enabled ? Math.max(16_384, draft.options.maxOutputTokens) : draft.options.maxOutputTokens }); }}><option value="disabled">关闭</option><option value="enabled">开启</option></select><p>开启时自动把输出上限提高到至少 16,384。</p></div>}
                {draft.protocol === 'anthropic-messages' && <div className={fieldClass}><Label htmlFor="provider-anthropic-thinking">Anthropic 思考预算</Label><Input id="provider-anthropic-thinking" type="number" min={1024} max={64000} disabled={!!busy} placeholder="留空关闭" value={draft.options.anthropicThinkingBudget ?? ''} onChange={event => updateOptions({ anthropicThinkingBudget: event.target.value ? Number(event.target.value) : undefined })} /><p>计入输出总上限，并至少为回答保留 32 tokens。</p></div>}
                {draft.protocol === 'gemini-generative-language' && <div className={fieldClass}><Label htmlFor="provider-gemini-thinking">Gemini 思考预算</Label><Input id="provider-gemini-thinking" type="number" min={0} max={65536} disabled={!!busy} placeholder="留空使用模型默认" value={draft.options.geminiThinkingBudget ?? ''} onChange={event => updateOptions({ geminiThinkingBudget: event.target.value ? Number(event.target.value) : undefined })} /></div>}
              </div></details>
              <div className="flex flex-wrap items-center gap-2"><Button type="submit" className="min-h-11" disabled={!!busy || !dirty}><Save />保存连接</Button><Button type="button" variant="ghost" className="min-h-11" disabled={!!busy || !dirty} onClick={() => setDraftState(null)}>放弃修改</Button><Button type="button" variant="ghost" className="ml-auto min-h-11 text-destructive" disabled={!!busy} onClick={() => setDeleteOpen(true)}><Trash2 />删除连接</Button></div>
            </form>
            <CheckStatus provider={selected} />
          </Card></TabsContent>
          <TabsContent value="models"><Card className="gap-6 p-6 shadow-none max-[640px]:p-4.5">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-serif text-xl font-semibold">这条连接的模型</h3><p className="mt-1 text-[11px] leading-6 text-muted-foreground">目录失败不会清空已保存模型；准确 ID 始终可以手动输入。</p></div><Button variant="outline" className="min-h-11" disabled={!!busy || !selected.hasCredential} onClick={discover}>{busy === '获取模型目录' ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}获取模型</Button></div>
            {dirty && <div className="rounded-lg border border-[#e8d8b2] bg-[#f7efdc] px-4 py-3 text-[11px] text-[#826426]">连接配置有未保存修改。模型测试始终使用已保存版本；请先保存或放弃修改。</div>}
            <form className="grid grid-cols-[minmax(0,1fr)_minmax(0,.7fr)_auto] gap-2 max-[640px]:grid-cols-1" onSubmit={event => { event.preventDefault(); saveModel(manualModel, manualName || null); }}><Input aria-label="模型 ID" required maxLength={300} className="font-mono" placeholder="准确模型 ID" value={manualModel} onChange={event => setManualState({ providerId: selected.id, modelId: event.target.value, name: manualName })} /><Input aria-label="显示名称" maxLength={200} placeholder="显示名称（可选）" value={manualName} onChange={event => setManualState({ providerId: selected.id, modelId: manualModel, name: event.target.value })} /><Button type="submit" className="min-h-10" disabled={!!busy}><Plus />手动添加</Button></form>
            {discoveries.length > 0 && <div className="rounded-lg border bg-secondary/30 p-3"><div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold"><Search size={14} />目录候选 · {discoveries.length}</div><div className="max-h-64 space-y-1 overflow-y-auto">{discoveries.map(model => <div key={model.modelId} className="flex min-h-11 items-center gap-3 rounded-md bg-card px-3 py-2"><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{model.displayName || model.modelId}</strong>{model.displayName && <code className="block truncate text-[10px] text-muted-foreground">{model.modelId}</code>}</span><Button size="sm" variant="ghost" disabled={!!busy} onClick={() => saveModel(model.modelId, model.displayName, 'discovered')}>添加</Button></div>)}</div></div>}
            <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="搜索模型" className="pl-9" placeholder="搜索模型 ID 或显示名称" value={modelSearch} onChange={event => setModelSearch(event.target.value)} /></div>
            <div className="grid gap-2">{selected.models.filter(model => `${model.modelId} ${model.displayName ?? ''}`.toLowerCase().includes(modelSearch.trim().toLowerCase())).map(model => {
              const isDefault = model.id === state.defaultProviderModelId;
              return <div key={model.id} className="flex min-h-16 items-center gap-3 rounded-lg border bg-[#fbfaf5] px-4 py-3 max-[640px]:flex-wrap"><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{model.displayName || model.modelId}</strong><code className="block truncate text-[10px] text-muted-foreground">{model.modelId}</code><span className="text-[9px] text-muted-foreground">{model.source === 'discovered' ? '目录添加' : model.source === 'migration' ? '旧配置迁移' : '手动添加'} · {model.enabled ? '已启用' : '已停用'} · 能力未知时不自动启用参数</span></span>{isDefault && <Badge><Check size={12} />默认</Badge>}<Button variant="ghost" size="sm" disabled={!!busy || isDefault} onClick={() => void perform(model.enabled ? '停用模型' : '启用模型', async () => { await rpc.providerModels.save({ providerId: selected.id, modelId: model.modelId, displayName: model.displayName, enabled: !model.enabled, source: model.source === 'discovered' ? 'discovered' : 'manual' }); }, model.enabled ? '模型已停用。' : '模型已启用。')}>{model.enabled ? '停用' : '启用'}</Button><Button variant="outline" size="sm" disabled={!!busy || isDefault || !selected.enabled || !model.enabled} onClick={() => setDefault(model.id)}>设为默认</Button><Button variant="outline" size="sm" disabled={!!busy || !selected.hasCredential || dirty || !model.enabled} title={dirty ? '请先保存或放弃连接修改' : undefined} onClick={() => setTestState({ providerId: selected.id, modelId: model.modelId })}><FlaskConical />测试</Button><Button variant="ghost" size="icon" aria-label={`删除模型 ${model.modelId}`} disabled={!!busy || isDefault} onClick={() => void perform('删除模型', async () => { await rpc.providerModels.remove({ id: model.id }); }, '模型已删除。')}><Trash2 /></Button></div>;
            })}{!selected.models.length && <div className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">尚无模型。获取目录或手动添加一个准确模型 ID。</div>}</div>
          </Card></TabsContent>
        </Tabs>
      </section> : <Card className={`items-center p-10 text-center shadow-none ${!providerId ? 'max-[900px]:hidden' : ''}`}><ShieldCheck size={28} className="text-primary" /><h2 className="font-serif text-2xl">{providerId ? '连接不存在' : '先添加一条连接'}</h2><p className="text-sm text-muted-foreground">{providerId ? '这条连接可能已删除，请返回列表重新选择。' : '选择预设，填写名称、地址、实际协议与 API Key。'}</p>{providerId ? <Button className="min-h-11" variant="outline" onClick={() => void navigate('/settings')}><ArrowLeft />返回连接列表</Button> : <Button className="min-h-11" onClick={() => setAddOpen(true)}><Plus />添加服务商</Button>}</Card>}
    </div>

    <AddProviderDialog open={addOpen} onOpenChange={setAddOpen} busy={busy} perform={perform} onCreated={id => void navigate(`/settings/providers/${id}`)} />
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent><DialogHeader><DialogTitle>删除“{selected?.name}”？</DialogTitle><DialogDescription>连接、Key、模型与检测记录都会删除。若它仍是默认连接，系统会要求你先明确选择替代项或清空默认。</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button variant="destructive" disabled={!!busy || !selected} onClick={() => { if (!selected) return; void perform('删除连接', async () => { await rpc.providers.remove({ id: selected.id, revision: selected.revision }); setDeleteOpen(false); void navigate('/settings'); }, '连接已删除。'); }}><Trash2 />确认删除</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={testModel !== null} onOpenChange={open => { if (!open) setTestState(null); }}><DialogContent><DialogHeader><DialogTitle>发起一次真实模型测试？</DialogTitle><DialogDescription>测试会向 {selected?.name} 发送“Reply with OK.”，验证地址、认证和模型调用，可能产生少量费用。检测结果会绑定当前配置版本。</DialogDescription></DialogHeader><DialogFooter><DialogClose asChild><Button variant="outline">取消</Button></DialogClose><Button disabled={!!busy || !selected || !testModel} onClick={() => { if (!selected || !testModel) return; const modelId = testModel; void perform('测试模型连接', async () => { const result = await rpc.providers.test({ providerId: selected.id, modelId, confirmCharge: true }); setTestState(null); const failed = result.checks.find(check => check.status === 'failed'); notify({ kind: failed ? 'error' : 'success', message: failed?.safeError ?? '连接测试通过。' }); }); }}><FlaskConical />确认测试</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

function CheckStatus({ provider }: { provider: ProviderConnection }) {
  const latestAt = provider.checks[0]?.checkedAt;
  const latest = latestAt ? provider.checks.filter(check => check.checkedAt === latestAt) : [];
  if (!latest.length) return <div className="rounded-lg border border-dashed p-4 text-[11px] text-muted-foreground">尚未测试。保存配置不依赖测试成功。</div>;
  const stale = latest.some(check => check.configRevision !== provider.revision);
  const label = { endpoint: '地址可达', authentication: '认证', model: '模型调用' } as const;
  return <div className="rounded-lg border bg-secondary/30 p-4"><div className="mb-3 flex items-center justify-between text-[11px]"><strong>最近连接检测</strong><span className={stale ? 'text-[#9a6b2f]' : 'text-muted-foreground'}>{stale ? '配置已变更 · 结果过期' : new Date(latestAt!).toLocaleString('zh-CN')}</span></div><div className="grid grid-cols-3 gap-2 max-[640px]:grid-cols-1">{latest.map(check => <div key={check.id} className="rounded-md border bg-card px-3 py-2"><span className="text-[10px] text-muted-foreground">{label[check.stage]}</span><strong className="mt-1 block text-xs">{check.status === 'passed' ? '通过' : check.status === 'failed' ? '失败' : '未单独验证'}</strong>{check.safeError && <p className="mt-1 text-[10px] leading-5 text-destructive">{check.safeError}</p>}</div>)}</div></div>;
}

function AddProviderDialog({ open, onOpenChange, busy, perform, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: string | null;
  perform: ViewProps['perform'];
  onCreated: (id: string) => void;
}) {
  const [presetId, setPresetId] = useState('openai');
  const preset = providerCatalog.find(item => item.id === presetId)!;
  const [name, setName] = useState<string>(preset.name);
  const [baseUrl, setBaseUrl] = useState<string>(preset.defaultBaseUrl);
  const [protocol, setProtocol] = useState<ProviderConnection['protocol']>(preset.defaultProtocol);
  const [credential, setCredential] = useState('');
  const [initialModelId, setInitialModelId] = useState('');
  function choose(id: string) {
    const next = providerCatalog.find(item => item.id === id)!;
    setPresetId(id); setName(next.name); setBaseUrl(next.defaultBaseUrl); setProtocol(next.defaultProtocol);
    setCredential(''); setInitialModelId('');
  }
  function submit() {
    void perform('添加连接', async () => {
      const created = await rpc.providers.create(providerCreateSchema.parse({
        presetId, name, baseUrl, protocol, enabled: true, credential: credential || undefined,
        initialModelId: initialModelId || undefined,
      }));
      onOpenChange(false); onCreated(created.id); setCredential(''); setInitialModelId('');
    }, '连接已添加。测试失败不会影响保存。');
  }
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) { setCredential(''); setInitialModelId(''); }
    onOpenChange(nextOpen);
  }
  return <Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="sm:max-w-2xl"><DialogHeader><DialogTitle className="font-serif text-2xl">添加服务商连接</DialogTitle><DialogDescription>预设只填入非敏感默认值。自定义网关需要选择它实际暴露的协议。</DialogDescription></DialogHeader><form className="grid gap-5" onSubmit={event => { event.preventDefault(); submit(); }}><div className="grid grid-cols-5 gap-2 max-[640px]:grid-cols-2">{providerCatalog.map(item => <button key={item.id} type="button" onClick={() => choose(item.id)} className={`grid min-h-20 place-items-center gap-1 rounded-lg border p-2 text-[10px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${item.id === presetId ? 'border-primary bg-[#faf3e8]' : 'bg-card hover:bg-secondary'}`}><ProviderIcon presetId={item.id} size={24} /><span>{item.name}</span></button>)}</div><p className="-mt-2 text-[11px] text-muted-foreground">{preset.description}</p><div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1"><div className={fieldClass}><Label htmlFor="new-provider-name">连接名称</Label><Input id="new-provider-name" required value={name} onChange={event => setName(event.target.value)} /></div><div className={fieldClass}><Label htmlFor="new-provider-protocol">实际协议</Label><select id="new-provider-protocol" className={selectClass} value={protocol} disabled={presetId !== 'custom' && preset.protocols.length === 1} onChange={event => setProtocol(event.target.value as ProviderConnection['protocol'])}>{preset.protocols.map(value => <option key={value} value={value}>{protocolLabels[value]}</option>)}</select></div></div><div className={fieldClass}><Label htmlFor="new-provider-url">Base URL</Label><Input id="new-provider-url" type="url" required value={baseUrl} onChange={event => setBaseUrl(event.target.value)} /></div><div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1"><div className={fieldClass}><Label htmlFor="new-provider-key">API Key（可稍后填写）</Label><Input id="new-provider-key" type="password" autoComplete="off" value={credential} onChange={event => setCredential(event.target.value)} /></div><div className={fieldClass}><Label htmlFor="new-provider-model">首个模型 ID（可选）</Label><Input id="new-provider-model" className="font-mono" value={initialModelId} onChange={event => setInitialModelId(event.target.value)} /></div></div><DialogFooter><DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose><Button type="submit" disabled={!!busy}><Plus />保存连接</Button></DialogFooter></form></DialogContent></Dialog>;
}
