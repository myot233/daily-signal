import { useAtom } from "jotai";
import {
  Check,
  FlaskConical,
  KeyRound,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { connectionSchema, settingsSchema } from "../../shared/types";
import type { Settings } from "../../shared/types";
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
  notify,
  apiKey,
  setApiKey,
  saveSettings,
}: ViewProps & {
  apiKey: string;
  setApiKey: (key: string) => void;
  saveSettings: (settings: Settings) => Promise<Settings>;
}) {
  const [draft, setDraft] = useAtom(modelDraftAtom);
  const { baseUrl, model, deepseekThinking } = draft ?? state.settings;
  const dirty =
    baseUrl !== state.settings.baseUrl ||
    model !== state.settings.model ||
    deepseekThinking !== state.settings.deepseekThinking;
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
          settingsSchema.parse({
            ...state.settings,
            baseUrl,
            model,
            deepseekThinking,
          }),
        );
        setDraft(null);
      },
      "模型配置已保存。API Key 未写入设置，仅留在本页内存。",
    );
  }
  function test() {
    void perform(
      "测试模型连接",
      async () => {
        await rpc.ai.test(
          connectionSchema.parse({ baseUrl, model, deepseekThinking, apiKey }),
        );
      },
      "连接测试成功，模型已返回有效文本。测试使用当前表单配置，不会自动保存。",
    );
  }

  return (
    <>
      <div className="view-heading">
        <div>
          <div className="eyebrow">自带密钥 · 自主选择</div>
          <h1>选择你的思考搭档。</h1>
          <p>连接公开的 OpenAI-compatible 服务，用你自己的模型与额度。</p>
        </div>
        <Badge variant={dirty ? "outline" : "secondary"}>
          {!dirty && <Check size={12} />}
          {dirty ? "配置有未保存修改" : "配置已保存"}
        </Badge>
      </div>
      <div className="settings-grid">
        <div className="settings-main">
          <Card className="settings-card">
            <div className="card-heading">
              <span className="small-icon">
                <FlaskConical size={20} />
              </span>
              <div>
                <h2>模型连接</h2>
                <p>连接地址、模型与思考模式保存在本地；密钥不保存。</p>
              </div>
            </div>
            <form
              className="stack-form"
              onSubmit={(event) => {
                event.preventDefault();
                save();
              }}
            >
              <div className="field">
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
                <p id="base-url-help" className="field-hint">
                  填写 HTTPS API 根路径，不要附加
                  /chat/completions。不能包含凭据、查询参数或锚点。
                </p>
              </div>
              <div className="field">
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
                <p className="field-hint">
                  使用服务商提供的准确模型 ID，模型需支持聊天文本生成。
                </p>
              </div>
              {provider === "api.deepseek.com" && (
                <div className="field">
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
                  <p id="thinking-help" className="field-hint">
                    默认关闭，适合资讯提取与日报总结，连接测试也使用此模式。开启后单次输出预算提高至
                    16,384 tokens（含推理），可能更慢且费用更高。仅作用于官方
                    api.deepseek.com，不影响其他服务商。
                  </p>
                </div>
              )}
              <div className="button-row">
                <Button type="submit" disabled={!!busy || !dirty}>
                  <Save />
                  保存配置
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!!busy || !dirty}
                  onClick={() => setDraft(null)}
                >
                  放弃修改
                </Button>
              </div>
            </form>
          </Card>
          <Card className="settings-card key-card">
            <div className="card-heading">
              <span className="small-icon">
                <KeyRound size={20} />
              </span>
              <div>
                <h2>临时 API Key</h2>
                <p>只在当前页面内存中，整页刷新或关闭后清除。</p>
              </div>
              <Badge variant="outline">不持久化</Badge>
            </div>
            <div className="field">
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
                placeholder="输入你的服务商密钥"
                aria-describedby="key-help"
              />
              <p id="key-help" className="field-hint">
                切换页面会保留。不会写入数据库、浏览器存储、URL 或导出文件。
              </p>
            </div>
            <div className="button-row">
              <Button
                variant="outline"
                disabled={
                  !!busy || !apiKey.trim() || !baseUrl.trim() || !model.trim()
                }
                onClick={test}
              >
                <FlaskConical />
                测试当前表单连接
              </Button>
              <Button
                variant="ghost"
                disabled={!!busy || !apiKey}
                onClick={() => {
                  setApiKey("");
                  notify({ kind: "success", message: "本页 API Key 已清除。" });
                }}
              >
                <Trash2 />
                清除 Key
              </Button>
            </div>
            <p className="quiet-note">
              测试会向 <strong>{provider}</strong> 发送当前 Key
              和简短测试提示，可能产生少量费用。测试不会保存表单，也不修改已保存配置。
            </p>
          </Card>
        </div>
        <aside className="settings-aside">
          <div className="privacy-card">
            <ShieldCheck size={28} strokeWidth={1.3} />
            <h2>密钥归你，选择也归你。</h2>
            <p>
              生成时，订阅文章内容与 API Key
              会发送给你选择的服务商。请仅连接你信任的域名，并了解对方的数据政策。
            </p>
            <div className="saved-config">
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
