import { createORPCClient, ORPCError } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { ContractRouterClient } from '@orpc/contract'
import { ZodError } from 'zod'
import type { contract } from '../../shared/contract'
import type {
  AppState,
  DigestGenerationEvent,
  DigestInput,
} from '../../shared/types'

export type View = 'today' | 'feeds' | 'articles' | 'archive' | 'template' | 'settings'
export type Notice = { kind: 'success' | 'error' | 'warning'; message: string; details?: string[] }
export type Perform = (label: string, action: () => Promise<void>, success?: string) => Promise<boolean>
export type ViewProps = { state: AppState; busy: string | null; perform: Perform; notify: (notice: Notice) => void }
export type DigestGenerationState = {
  sessionId: string
  events: DigestGenerationEvent[]
}
export type StartDigestGeneration = (input: DigestInput) => Promise<boolean>

export const rpc: ContractRouterClient<typeof contract> = createORPCClient(new RPCLink({
  url: () => `${window.location.origin}/rpc`,
  method: 'POST',
}))

export function errorMessage(error: unknown) {
  if (error instanceof ZodError) return error.issues.map(issue => issue.message).join('；')
  if (error instanceof ORPCError && error.defined) return error.message
  if (error instanceof Error && !(error instanceof ORPCError) && !(error instanceof TypeError)) return error.message
  return '请求未完成，请检查本地服务与网络后重试。'
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
export function dayBounds(date: string) {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { startAt: start.toISOString(), endAt: end.toISOString() }
}
export function formatDate(value: string, time = false) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  if (Number.isNaN(date.getTime())) return '日期未知'
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } as const : {}) }).format(date)
}
export function safeUrl(value: string | undefined) {
  if (!value) return undefined
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined } catch { return undefined }
}
export function download(content: string | Blob, filename: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
