import { eventIterator, oc } from '@orpc/contract';
import { z } from 'zod';
import { addFeedSchema, appStateSchema, connectionSchema, digestInputSchema, digestSchema, feedSchema, idSchema, importOpmlSchema, importResultSchema, okSchema, refreshResultSchema, settingsSchema } from './types';
import { generationProgressSchema } from './progress';

export const generationEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('progress'), progress: generationProgressSchema }),
  z.object({ type: z.literal('complete'), digest: digestSchema }),
  z.object({ type: z.literal('failed'), message: z.string() }),
]);
export type GenerationEvent = z.infer<typeof generationEventSchema>;

const procedure = oc.errors({
  BAD_REQUEST: {}, NOT_FOUND: {}, CONFLICT: {}, PAYLOAD_TOO_LARGE: {},
  BAD_GATEWAY: {}, GATEWAY_TIMEOUT: {}, INTERNAL_SERVER_ERROR: {},
});
export const contract = {
  state: procedure.output(appStateSchema),
  feeds: {
    add: procedure.input(addFeedSchema).output(feedSchema),
    remove: procedure.input(idSchema).output(okSchema),
    refresh: procedure.output(refreshResultSchema),
    import: procedure.input(importOpmlSchema).output(importResultSchema),
    export: procedure.output(z.object({ opml: z.string() })),
  },
  settings: { save: procedure.input(settingsSchema).output(settingsSchema) },
  ai: { test: procedure.input(connectionSchema).output(okSchema) },
  digests: {
    generate: procedure.input(digestInputSchema).output(digestSchema),
    generateStream: procedure.input(digestInputSchema).output(eventIterator(generationEventSchema)),
    remove: procedure.input(idSchema).output(okSchema),
  },
};
