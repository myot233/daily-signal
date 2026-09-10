import { ui } from "../lib/ui-styles"
import { useAtom } from "jotai";
import {
  Check,
  FlaskConical,
  KeyRound,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { connectionSchema, settingsUpdateSchema } from "../../shared/types";
import type { Settings, SettingsUpdate } from "../../shared/types";
import { rpc } from "../lib/client";
import type { ViewProps } from "../lib/client";
import { modelDraftAtom } from "../lib/state";
import type { ModelDraft } from "../lib/state";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function SettingsView({
  state,
  busy,
  perform,
  apiKey,
  setApiKey,
  saveSettings,
}: ViewProps & {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveSettings: (settings: SettingsUpdate) => Promise<Settings>;
}) {
  const [draft, setDraft] = useAtom(modelDraftAtom);
  const { baseUrl, model, deepseekThinking } = draft ?? state.settings;
  const dirty =
    baseUrl !== state.settings.baseUrl ||
    model !== state.settings.model ||
    deepseekThinking !== state.settings.deepseekThinking || apiKey.length > 0;
  const canUseSavedKey = state.hasApiKey && baseUrl.trim().replace(/\/+$/, "") === state.settings.baseUrl;
  let provider = "有效的公开 HTTPS 服务商";
  try {
    provider = new URL(baseUrl).hostname || provider;
  } catch {
    /* Shared schema validates on submission. */
  }
  const savedProvider = new URL(state.settings.baseUrl).hostname;

  function updateDraft(changes: Partial<ModelDraft>) {
    setDraft((current) => ({
      ...(current ?? { baseUrl, model, deepseekThinking }),
      ...changes,
    }));
  }

  function save() {
    void perform(
      "保存模型配置",
      async () => {
        await saveSettings(
          settingsUpdateSchema.parse({
            ...state.settings,
            baseUrl,
            model,
            deepseekThinking,
            apiKey: apiKey || undefined,
          }),
        );
        setDraft(null);
        setApiKey("");
      },
      "模型配置已保存到本地数据库，下次打开可直接使用。",
    );
  }
  function test() {
    void perform(
      "测试模型连接",
      async () => {
        await rpc.ai.test(
          connectionSchema.parse({ baseUrl, model, deepseekThinking, apiKey: apiKey || undefined }),
        );
      },
      "连接测试成功，模型已返回有效文本。测试使用当前表单配置，不会自动保存。",
    );
  }

  return (
    <>
      <div className={ui.viewHeading}>
        <div>
          <div className={ui.eyebrow}>自带密钥 · 自主选择</div>
          <h1>选择你的思考搭档。</h1>
          <p>连接公开的 OpenAI-compatible 服务，用你自己的模型与额度。</p>
        </div>
        <Badge variant={dirty ? "outline" : "secondary"}>
          {!dirty && <Check size={12} />}
          {dirty ? "配置有未保存修改" : "配置已保存"}
        </Badge>
      </div>
      <div className="grid grid-cols-[minmax(0,_1fr)_260px] items-start gap-6.75 max-[1150px]:grid-cols-1">
        <div className="grid gap-5.5 min-w-0">
          <Card className="p-6.75 shadow-none gap-5.75 max-[640px]:py-5.25 max-[640px]:px-4.75 max-[640px]:gap-5.25 max-[640px]:[&_input]:text-[16px] max-[640px]:[&_.button-row_button]:text-[11px]">
            <div className={ui.cardHeading}>
              <span className="small-icon grid place-items-center shrink-0 w-10.75 h-10.75 bg-[#f4ecdf] text-[#b07848] rounded-[9px]">
                <FlaskConical size={20} />
              </span>
              <div>
                <h2>模型连接</h2>
                <p>连接地址、模型、思考模式与 API Key 默认保存在本地数据库。</p>
              </div>
            </div>
            <form
              className="flex flex-col gap-5.5"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <div className={ui.field}>
                <Label htmlFor="ai-base-url">Base URL</Label>
                <Input
                  id="ai-base-url"
                  type="url"
                  maxLength={2000}
                  required
                  value={baseUrl}
                  onChange={(event) =>
                    updateDraft({ baseUrl: event.target.value })
                  }
                  disabled={!!busy}
                  placeholder="https://api.openai.com/v1"
                  aria-describedby="base-url-help"
                />
                <p id="base-url-help" className="field-hint text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere">
                  填写 HTTPS API 根路径，不要附加
                  /chat/completions。不能包含凭据、查询参数或锚点。
                </p>
                {state.hasApiKey && !canUseSavedKey && (
                  <p className="text-xs text-primary" role="status">
                    连接地址已修改。请填写新服务商的 Key；留空保存将清除旧 Key。
                  </p>
                )}
              </div>
              <div className={ui.field}>
                <Label htmlFor="ai-model">模型名称</Label>
                <Input
                  id="ai-model"
                  required
                  maxLength={200}
                  value={model}
                  onChange={(event) =>
                    updateDraft({ model: event.target.value })
                  }
                  disabled={!!busy}
                  placeholder="gpt-4.1-mini"
                />
                <p className="field-hint text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere">
                  使用服务商提供的准确模型 ID，模型需支持聊天文本生成。
                </p>
              </div>
              {provider === "api.deepseek.com" && (
                <div className={ui.field}>
                  <Label
                    id="deepseek-thinking-label"
                    htmlFor="deepseek-thinking"
                  >
                    DeepSeek 深度思考
                  </Label>
                  <Button
                    id="deepseek-thinking"
                    type="button"
                    role="switch"
                    aria-checked={deepseekThinking === "enabled"}
                    aria-labelledby="deepseek-thinking-label"
                    aria-describedby="thinking-help"
                    variant={
                      deepseekThinking === "enabled" ? "default" : "outline"
                    }
                    disabled={!!busy}
                    onClick={() =>
                      updateDraft({
                        deepseekThinking:
                          deepseekThinking === "enabled"
                            ? "disabled"
                            : "enabled",
                      })
                    }
                  >
                    {deepseekThinking === "enabled"
                      ? "已开启"
                      : "已关闭 · 摘要推荐"}
                  </Button>
                  <p id="thinking-help" className="field-hint text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere">
                    默认关闭，适合资讯提取与日报总结，连接测试也使用此模式。开启后单次输出预算提高至
                    16,384 tokens（含推理），可能更慢且费用更高。仅作用于官方
                    api.deepseek.com，不影响其他服务商。
                  </p>
                </div>
              )}
              <div className="button-row flex items-center flex-wrap gap-1.75">
                <Button type="submit" disabled={!!busy || !dirty}>
                  <Save />
                  保存配置
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!!busy || !dirty}
                  onClick={() => { setDraft(null); setApiKey(""); }}
                >
                  放弃修改
                </Button>
              </div>
            </form>
          </Card>
          <Card className="p-6.75 shadow-none gap-5.75 max-[640px]:py-5.25 max-[640px]:px-4.75 max-[640px]:gap-5.25 max-[640px]:[&_input]:text-[16px] max-[640px]:[&_.button-row_button]:text-[11px] [&_.small-icon]:text-[#74805b] [&_.small-icon]:bg-[#edf0e5] [&_.card-heading_[data-slot=badge]]:text-[9px]">
            <div className={ui.cardHeading}>
              <span className="small-icon grid place-items-center shrink-0 w-10.75 h-10.75 bg-[#f4ecdf] text-[#b07848] rounded-[9px]">
                <KeyRound size={20} />
              </span>
              <div>
                <h2>服务商 API Key</h2>
                <p>保存后可在刷新页面或重启服务后继续使用。</p>
              </div>
              <Badge variant="outline">{state.hasApiKey ? "已保存 Key" : "尚未配置"}</Badge>
            </div>
            <div className={ui.field}>
              <Label htmlFor="ai-key">API Key</Label>
              <Input
                id="ai-key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="none"
                maxLength={4096}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                disabled={!!busy}
                placeholder={canUseSavedKey ? "已保存，留空保留原 Key" : "输入你的服务商密钥"}
                aria-describedby="key-help"
              />
              <p id="key-help" className="field-hint text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere">
                点击保存后写入本地数据库。已保存的 Key 不会回填到页面或包含在导出文件中；输入新 Key 可替换。
              </p>
            </div>
            <div className="button-row flex items-center flex-wrap gap-1.75">
              <Button disabled={!!busy || !dirty} onClick={save}>
                <Save />保存配置与 Key
              </Button>
              <Button
                variant="outline"
                disabled={
                  !!busy || (!apiKey.trim() && !canUseSavedKey) || !baseUrl.trim() || !model.trim()
                }
                onClick={test}
              >
                <FlaskConical />
                测试当前表单连接
              </Button>
              <Button
                variant="ghost"
                disabled={!!busy || (!apiKey && !state.hasApiKey)}
                onClick={() => {
                  void perform("清除 API Key", async () => {
                    await saveSettings({ ...state.settings, apiKey: null });
                    setApiKey("");
                  }, "已从本地数据库清除 API Key。");
                }}
              >
                <Trash2 />
                清除 Key
              </Button>
            </div>
            <p className="quiet-note text-muted-foreground text-[11px] leading-[1.9] wrap-anywhere [&_strong]:font-medium [&_strong]:text-[#655747]">
              测试会向 <strong>{provider}</strong> 发送新输入或已保存的 Key
              和简短测试提示，可能产生少量费用。测试不会保存表单，也不修改已保存配置。
            </p>
          </Card>
        </div>
        <aside className="settings-aside">
          <div className="bg-[#eeece1] border border-[#e2decf] py-6.75 px-5.75 rounded-[8px] text-[#777461] [&_>_svg]:text-[#8a8a67] [&_>_svg]:mb-4.25 [&_h2]:font-serif [&_h2]:text-[22px] [&_h2]:leading-[1.65] [&_h2]:text-[#666147] [&_h2]:mb-3.25 [&_p]:text-[11px] [&_p]:leading-[1.9] [&_p]:mt-3.75 max-[1150px]:max-w-none max-[640px]:p-6">
            <ShieldCheck size={28} strokeWidth={1.3} />
            <h2>密钥归你，选择也归你。</h2>
            <p>
              生成时，订阅文章内容与 API Key
              会发送给你选择的服务商。请仅连接你信任的域名，并了解对方的数据政策。
            </p>
            <div className="flex flex-col gap-1.5 py-4.25 mt-5 border-y border-y-[#d9d4c2] wrap-anywhere [&_span]:text-[9px] [&_span]:text-[#94886f] [&_strong]:font-medium [&_strong]:text-[14px] [&_code]:text-[10px]">
              <span>下次生成使用 · 已保存配置</span>
              <strong>{state.settings.model}</strong>
              <code>{savedProvider}</code>
              {savedProvider === "api.deepseek.com" && (
                <span>
                  深度思考：
                  {state.settings.deepseekThinking === "disabled"
                    ? "关闭"
                    : "开启"}
                </span>
              )}
            </div>
            <p>
              兼容范围：公开 HTTPS 的 OpenAI-compatible API。暂不支持本地 Ollama
              / LM Studio，也不直接支持原生 Anthropic / Gemini 协议。
            </p>
            <p>
              这不是托管定时任务。每次生成由你主动发起；无需生成时，可以随时清除
              Key。
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
