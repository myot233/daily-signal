import { HttpError } from '../../core/errors';
import { fetchPublicText } from '../../infrastructure/network/public-fetch';

export type ProviderTransport = typeof fetchPublicText;

export function createControlledProviderFetch(
  baseUrl: string,
  timeoutMs = 120_000,
  transport: ProviderTransport = fetchPublicText,
) {
  const configured = new URL(baseUrl);
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const target = new URL(request.url);
    if (
      request.method !== 'POST' ||
      target.protocol !== 'https:' ||
      target.origin !== configured.origin ||
      !request.headers.get('content-type')?.includes('application/json')
    ) {
      throw new HttpError(400, 'AI 请求必须以 JSON POST 发送到所配置的 HTTPS 服务。');
    }
    const response = await transport(request.url, {
      method: 'POST',
      headers: Object.fromEntries(request.headers),
      body: await request.text(),
      signal: request.signal,
      timeoutMs,
      maxBytes: 2 * 1024 * 1024,
    });
    return new Response(response.text, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}
