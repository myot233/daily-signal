import { HttpError } from '../core/errors';
import { removeDigest } from '../modules/ai/repository';
import { generateDigest, testConnection } from '../modules/ai/service';
import { rpc } from './procedure';

let generating = false;

export const aiProcedures = {
  test: rpc.ai.test.handler(async ({ input, context }) => {
    await testConnection(input, { signal: context.signal });
    return { ok: true };
  }),
};

export const digestProcedures = {
  generate: rpc.digests.generate.handler(async ({ input, context }) => {
    if (generating) throw new HttpError(409, '日报正在生成，请等待完成。');
    generating = true;
    try {
      return await generateDigest(input, { signal: context.signal });
    } finally {
      generating = false;
    }
  }),
  remove: rpc.digests.remove.handler(({ input }) => {
    removeDigest(input.id);
    return { ok: true };
  }),
};
