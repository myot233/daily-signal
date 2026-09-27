import { removeDigest } from '@daily-signal/ai/repository';
import {
  ensureDigestGenerationSession,
  startDigestGeneration,
  subscribeDigestGeneration,
} from '@daily-signal/ai/generation-queue';
import { testConnection, translateArticle } from '@daily-signal/ai';
import { rpc } from './procedure';

export const aiProcedures = {
  translate: rpc.ai.translate.handler(({ input, context }) =>
    translateArticle(input, { signal: context.signal }),
  ),
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
