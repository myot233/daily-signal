import { lookup, type LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch, type Dispatcher } from 'undici';

export class PublicFetchError extends Error {
  constructor(message: string, public readonly kind: 'network' | 'timeout' | 'cancelled' | 'oversize' = 'network') {
    super(message);
    this.name = 'PublicFetchError';
  }
}

function publicAddress(value: string): boolean {
  try {
    const address = ipaddr.process(value);
    if (address.range() !== 'unicast') return false;
    // Only allocated global-unicast IPv6; reject transition and reserved space.
    return address.kind() === 'ipv4' || (address.toByteArray()[0]! & 0xe0) === 0x20;
  } catch {
    return false;
  }
}

export function normalizePublicUrl(value: string): string {
  if (typeof value !== 'string' || value.length > 8192 || /[ \p{Cc}]/u.test(value.trim())) {
    throw new PublicFetchError('请输入有效的公开 HTTP(S) 地址。');
  }
  let url: URL;
  try { url = new URL(value.trim()); } catch {
    throw new PublicFetchError('请输入有效的公开 HTTP(S) 地址。');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new PublicFetchError('仅允许不含用户名和密码的 HTTP(S) 地址。');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host.includes('%') || (ipaddr.isValid(host) ? !publicAddress(host) :
    !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid|onion)$/.test(host))) {
    throw new PublicFetchError('不允许访问本机、私有网络或保留地址。');
  }
  url.hash = '';
  if (!url.hostname.startsWith('[')) url.hostname = host;
  return url.href;
}

// Validation happens in the connector's actual lookup, not in a separate DNS
// preflight. The connector receives only the addresses that were just validated.
type ResolveAddresses = (hostname: string, callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;
export function createPublicLookup(resolve: ResolveAddresses = (hostname, callback) => lookup(hostname, { all: true, verbatim: true }, callback)): LookupFunction {
  return (hostname, options, callback) => {
  resolve(hostname, (error, addresses) => {
    if (error || addresses.length === 0) {
      callback(new PublicFetchError('无法解析服务器地址。'), '', 0);
      return;
    }
    if (addresses.some(address => !publicAddress(address.address))) {
      callback(new PublicFetchError('服务器解析到私有网络或保留地址，已拒绝访问。'), '', 0);
      return;
    }
    const family = options.family === 4 || options.family === 6 ? options.family : 0;
    const eligible = family ? addresses.filter(address => address.family === family) : addresses;
    if (eligible.length === 0) {
      callback(new PublicFetchError('服务器没有可用的公开 IP 地址。'), '', 0);
      return;
    }
    if (options.all) callback(null, eligible);
    else callback(null, eligible[0]!.address, eligible[0]!.family);
  });
  };
}
const dispatcher = new Agent({ connect: { lookup: createPublicLookup(), timeout: 20_000 } });

export interface FetchOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  signal?: AbortSignal;
  acceptContentTypes?: string[];
}

export interface FetchResult {
  text: string;
  status: number;
  ok: boolean;
  contentType?: string;
  url?: string;
}

function safeFailure(error: unknown): PublicFetchError {
  // Undici wraps connector failures in a TypeError. Never include arbitrary
  // error messages: they can contain a URL, request headers or response content.
  let cause: unknown = error;
  for (let depth = 0; depth < 4 && cause instanceof Error; depth++) {
    if (cause instanceof PublicFetchError) return cause;
    cause = cause.cause;
  }
  return new PublicFetchError('网络请求失败，请检查地址、网络连接或服务器证书。');
}

// The dispatcher seam is for isolated network tests; production always uses
// the connector above, which validates DNS answers on the actual connection.
export function createPublicFetcher(transport: Dispatcher) {
return async function fetchPublicText(value: string, options: FetchOptions = {}): Promise<FetchResult> {
  let current = normalizePublicUrl(value);
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxBytes ?? 3 * 1024 * 1024;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new PublicFetchError('请求超时或响应大小限制无效。');
  }
  const method = options.method ?? 'GET';
  let headers = { ...options.headers };
  // A caller cannot override the destination using the HTTP Host header.
  if (Object.keys(headers).some(key => /^(?:host|proxy-authorization|proxy-connection)$/i.test(key))) {
    throw new PublicFetchError('请求包含不允许的网络头。');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  try {
    for (let redirects = 0; ; redirects++) {
      signal.throwIfAborted();
      const response = await fetch(current, {
        method, headers, body: options.body, redirect: 'manual',
        dispatcher: transport, signal,
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        if (method === 'POST') throw new PublicFetchError('AI 服务返回重定向；为保护 API Key，请填写最终 API 地址。');
        if (redirects >= 4) throw new PublicFetchError('服务器重定向超过 4 次。');
        const location = response.headers.get('location');
        if (!location) throw new PublicFetchError('服务器重定向缺少目标地址。');
        let next: string;
        try { next = new URL(location, current).href; } catch {
          throw new PublicFetchError('服务器返回了无效的重定向地址。');
        }
        next = normalizePublicUrl(next);
        if (new URL(next).origin !== new URL(current).origin) {
          headers = Object.fromEntries(Object.entries(headers).filter(([key]) => !/^(?:authorization|cookie)$/i.test(key)));
        }
        current = next;
        continue;
      }
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
      if (response.ok && options.acceptContentTypes && !options.acceptContentTypes.includes(contentType)) {
        await response.body?.cancel();
        throw new PublicFetchError('页面不是支持的 HTML 或纯文本内容。');
      }
      const declaredSize = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
        await response.body?.cancel();
        throw new PublicFetchError('服务器响应超过允许的大小。', 'oversize');
      }
      const decoder = new TextDecoder();
      let bytes = 0;
      let text = '';
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            signal.throwIfAborted();
            const chunk = await reader.read();
            signal.throwIfAborted();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > maxBytes) {
              await reader.cancel();
              throw new PublicFetchError('服务器响应超过允许的大小。', 'oversize');
            }
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          if (signal.aborted) await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      }
      signal.throwIfAborted();
      return { text, status: response.status, ok: response.ok, contentType, url: current };
    }
  } catch (error) {
    if (options.signal?.aborted && signal.reason === options.signal.reason) throw new PublicFetchError('请求已取消。', 'cancelled');
    if (controller.signal.aborted) throw new PublicFetchError('请求超时，请稍后重试。', 'timeout');
    throw safeFailure(error);
  } finally { clearTimeout(timer); }
}
}

export const fetchPublicText = createPublicFetcher(dispatcher);
