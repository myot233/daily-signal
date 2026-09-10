import { removeDigest } from '../modules/ai/repository';
import {
  ensureDigestGenerationSession,
  startDigestGeneration,
  subscribeDigestGeneration,
} from '../modules/ai/generation-queue';
import { testConnection } from '../modules/ai/service';
import { rpc } from './procedure';

export const aiProcedures = {
  test: rpc.ai.test.handler(async ({ input, context }) => {
    await testConnection(input, { signal: context.signal });
    return { ok: true };
  }),
};

export const digestProcedures = {
  generate: rpc.digests.generate.handler(({ input }) => startDigestGeneration(input)),
  subscribe: rpc.digests.subscribe.handler(({ input, context }) => {
    ensureDigestGenerationSession(input.sessionId);
    return subscribeDigestGeneration(input, context.signal);
  }),
  remove: rpc.digests.remove.handler(({ input }) => {
    removeDigest(input.id);
    return { ok: true };
  }),
};
