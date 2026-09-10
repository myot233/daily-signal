import { eventIterator, oc } from '@orpc/contract';
import { z } from 'zod';
import {
  addFeedSchema,
  appStateSchema,
  connectionSchema,
  digestGenerationEventSchema,
  digestGenerationStartSchema,
  digestGenerationSubscriptionSchema,
  digestInputSchema,
  feedSchema,
  idSchema,
  importOpmlSchema,
  importResultSchema,
  okSchema,
  refreshResultSchema,
  settingsSchema,
  settingsUpdateSchema,
} from './types';
import {
  providerConnectionSchema, providerCreateSchema, providerDiscoverResultSchema, providerDiscoverSchema,
  providerListSchema, providerModelRemoveSchema, providerModelSaveSchema, providerModelSchema,
  providerRemoveSchema, providerTestResultSchema, providerTestSchema, providerUpdateSchema,
  setDefaultProviderModelSchema,
} from './providers/schemas';

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
  providers: {
    list: procedure.output(providerListSchema),
    create: procedure.input(providerCreateSchema).output(providerConnectionSchema),
    update: procedure.input(providerUpdateSchema).output(providerConnectionSchema),
    remove: procedure.input(providerRemoveSchema).output(okSchema),
    discoverModels: procedure.input(providerDiscoverSchema).output(providerDiscoverResultSchema),
    test: procedure.input(providerTestSchema).output(providerTestResultSchema),
  },
  providerModels: {
    save: procedure.input(providerModelSaveSchema).output(providerModelSchema),
    remove: procedure.input(providerModelRemoveSchema).output(okSchema),
  },
  defaultModel: { set: procedure.input(setDefaultProviderModelSchema).output(okSchema) },
  ai: { test: procedure.input(connectionSchema).output(okSchema) },
  digests: {
    generate: procedure.input(digestInputSchema).output(digestGenerationStartSchema),
    subscribe: procedure
      .input(digestGenerationSubscriptionSchema)
      .output(eventIterator(digestGenerationEventSchema)),
    remove: procedure.input(idSchema).output(okSchema),
  },
};
