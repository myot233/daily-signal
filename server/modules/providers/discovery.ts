import type { ProviderProtocol } from '../../../shared/providers/catalog';
import { getProvider, getProviderCredential } from './repository';
import type { ProviderTransport } from './transport';
import { fetchPublicText } from '../../infrastructure/network/public-fetch';
import { HttpError } from '../../core/errors';

function modelsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/models`;
}

function authHeaders(protocol: ProviderProtocol, apiKey: string): Record<string, string> {
  if (protocol === 'anthropic-messages')
    return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  if (protocol === 'gemini-generative-language') return { 'x-goog-api-key': apiKey };
  return { authorization: `Bearer ${apiKey}` };
}

function upstreamError(status: number): HttpError {
  const messages: Record<number, string> = {
    401: '模型目录认证失败，请检查 API Key。',
    403: '当前 API Key 无权读取模型目录。你仍可手动添加模型。',
    404: '此服务未提供模型目录。你仍可手动添加模型。',
    429: '模型服务限额或请求频率受限，请稍后重试。',
  };
  return new HttpError(
    502,
    messages[status] ?? `模型目录请求失败（HTTP ${status}）。你仍可手动添加模型。`,
  );
}

export async function discoverModels(
  providerId: string,
  transport: ProviderTransport = fetchPublicText,
  signal?: AbortSignal,
) {
  const provider = getProvider(providerId);
  const apiKey = getProviderCredential(providerId);
  if (!apiKey) throw new HttpError(400, '请先保存这条连接的 API Key；也可以直接手动添加模型。');
  const response = await transport(modelsEndpoint(provider.baseUrl), {
    method: 'GET',
    headers: authHeaders(provider.protocol, apiKey),
    timeoutMs: Math.min(provider.options.timeoutMs, 30_000),
    maxBytes: 512 * 1024,
    redirect: 'error',
    signal,
  });
  if (!response.ok) throw upstreamError(response.status);
  let data: unknown;
  try {
    data = JSON.parse(response.text);
  } catch {
    throw new HttpError(502, '模型目录返回了无法解析的 JSON。你仍可手动添加模型。');
  }
  const root = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const rows = Array.isArray(root.data)
    ? root.data
    : Array.isArray(root.models)
      ? root.models
      : null;
  if (!rows) throw new HttpError(502, '模型目录格式无法识别。你仍可手动添加模型。');
  const models = rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    if (
      provider.protocol === 'gemini-generative-language' &&
      Array.isArray(item.supportedGenerationMethods) &&
      !item.supportedGenerationMethods.includes('generateContent')
    )
      return [];
    const rawId =
      typeof item.id === 'string' ? item.id : typeof item.name === 'string' ? item.name : '';
    const modelId =
      provider.protocol === 'gemini-generative-language' ? rawId.replace(/^models\//, '') : rawId;
    if (!modelId || modelId.length > 300 || /\p{Cc}/u.test(modelId)) return [];
    const rawName =
      typeof item.display_name === 'string'
        ? item.display_name
        : typeof item.displayName === 'string'
          ? item.displayName
          : null;
    return [{ modelId, displayName: rawName?.slice(0, 200) ?? null }];
  });
  const byId = new Map<string, (typeof models)[number]>();
  for (const model of models) {
    const existing = byId.get(model.modelId);
    if (!existing || (!existing.displayName && model.displayName)) byId.set(model.modelId, model);
  }
  const unique = [...byId.values()]
    .sort((left, right) => left.modelId.localeCompare(right.modelId))
    .slice(0, 500);
  return { models: unique };
}
