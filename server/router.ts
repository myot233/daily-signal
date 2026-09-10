import { implement, ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { contract } from '../shared/contract';
import { db, getState } from './db';
import { digests, feeds, settings } from './schema';
import { addFeed, exportOpml, importOpml, refreshFeeds } from './feeds';
import { generateDigest, testConnection } from './ai';
import { HttpError } from './errors';
import { normalizePublicUrl, PublicFetchError } from './network';

export interface RpcContext { signal?: AbortSignal }
const implementer = implement(contract).$context<RpcContext>();
const safeErrors = implementer.middleware(async ({ next }) => {
  try { return await next(); } catch (error) {
    if (error instanceof HttpError) {
      const codes: Record<number, string> = { 400: 'BAD_REQUEST', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 502: 'BAD_GATEWAY', 504: 'GATEWAY_TIMEOUT' };
      throw new ORPCError(codes[error.status] ?? 'INTERNAL_SERVER_ERROR', { message: error.message });
    }
    if (error instanceof PublicFetchError) {
      throw new ORPCError(error.kind === 'timeout' || error.kind === 'cancelled' ? 'GATEWAY_TIMEOUT' : 'BAD_GATEWAY', { message: error.message });
    }
    if (error instanceof ORPCError && error.code === 'BAD_REQUEST') {
      throw new ORPCError('BAD_REQUEST', { message: '输入无效，请检查字段格式和长度。' });
    }
    // Do not serialize or log raw SDK errors, which can contain API credentials.
    console.error('RPC procedure failed with an unexpected internal error.');
    throw new ORPCError('INTERNAL_SERVER_ERROR', { message: '服务器内部错误，请稍后重试。' });
  }
});
const rpc = implementer.use(safeErrors);
let refreshing = false;
let generating = false;

export const router = implementer.router({
  state: rpc.state.handler(() => getState()),
  feeds: {
    add: rpc.feeds.add.handler(({ input }) => addFeed(input.url, input.category)),
    remove: rpc.feeds.remove.handler(({ input }) => {
      const result = db.delete(feeds).where(eq(feeds.id, input.id)).run();
      if (!result.changes) throw new HttpError(404, '订阅源不存在。');
      return { ok: true };
    }),
    refresh: rpc.feeds.refresh.handler(async () => {
      if (refreshing) throw new HttpError(409, '订阅正在刷新或导入，请等待完成。');
      refreshing = true;
      try { return await refreshFeeds(); } finally { refreshing = false; }
    }),
    import: rpc.feeds.import.handler(async ({ input }) => {
      if (refreshing) throw new HttpError(409, '订阅正在刷新或导入，请等待完成。');
      refreshing = true;
      try { return await importOpml(input.opml); } finally { refreshing = false; }
    }),
    export: rpc.feeds.export.handler(() => ({ opml: exportOpml() })),
  },
  settings: {
    save: rpc.settings.save.handler(({ input }) => {
      normalizePublicUrl(input.baseUrl);
      db.update(settings).set({ value: input }).where(eq(settings.id, 1)).run();
      return input;
    }),
  },
  ai: {
    test: rpc.ai.test.handler(async ({ input, context }) => {
      await testConnection(input, { signal: context.signal });
      return { ok: true };
    }),
  },
  digests: {
    generate: rpc.digests.generate.handler(async ({ input, context }) => {
      if (generating) throw new HttpError(409, '日报正在生成，请等待完成。');
      generating = true;
      try { return await generateDigest(input, { signal: context.signal }); } finally { generating = false; }
    }),
    remove: rpc.digests.remove.handler(({ input }) => {
      const result = db.delete(digests).where(eq(digests.id, input.id)).run();
      if (!result.changes) throw new HttpError(404, '日报不存在。');
      return { ok: true };
    }),
  },
});
