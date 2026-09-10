import { implement, ORPCError } from '@orpc/server';
import { contract } from '../../shared/contract';
import { HttpError } from '../core/errors';
import { PublicFetchError } from '../infrastructure/network/public-fetch';

export interface RpcContext {
  signal?: AbortSignal;
}

const httpErrorCodes: Record<number, string> = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  502: 'BAD_GATEWAY',
  504: 'GATEWAY_TIMEOUT',
};

export const implementer = implement(contract).$context<RpcContext>();
const safeErrors = implementer.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof HttpError) {
      throw new ORPCError(httpErrorCodes[error.status] ?? 'INTERNAL_SERVER_ERROR', {
        message: error.message,
      });
    }
    if (error instanceof PublicFetchError) {
      throw new ORPCError(
        error.kind === 'timeout' || error.kind === 'cancelled' ? 'GATEWAY_TIMEOUT' : 'BAD_GATEWAY',
        { message: error.message },
      );
    }
    if (error instanceof ORPCError && error.code === 'BAD_REQUEST') {
      throw new ORPCError('BAD_REQUEST', { message: '输入无效，请检查字段格式和长度。' });
    }
    // SDK errors may contain API credentials. Never serialize or log them.
    console.error('RPC procedure failed with an unexpected internal error.');
    throw new ORPCError('INTERNAL_SERVER_ERROR', {
      message: '服务器内部错误，请稍后重试。',
    });
  }
});

export const rpc = implementer.use(safeErrors);
