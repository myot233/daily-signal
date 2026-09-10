import { oc } from '@orpc/contract';
import { z } from 'zod';
import { addFeedSchema, appStateSchema, connectionSchema, digestInputSchema, digestSchema, feedSchema, idSchema, importOpmlSchema, importResultSchema, okSchema, refreshResultSchema, settingsSchema, settingsUpdateSchema } from './types';

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
  settings: { save: procedure.input(settingsUpdateSchema).output(settingsSchema) },
  ai: { test: procedure.input(connectionSchema).output(okSchema) },
  digests: {
    generate: procedure.input(digestInputSchema).output(digestSchema),
    remove: procedure.input(idSchema).output(okSchema),
  },
};
