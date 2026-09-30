import { eventIterator, oc } from '@orpc/contract';
import { z } from 'zod';
import {
  addFeedSchema,
  articleSchema,
  articleUpdateSchema,
  markArticlesReadSchema,
  feedUpdateSchema,
  appStateSchema,
  automationSettingsSchema,
  connectionSchema,
  digestGenerationEventSchema,
  digestGenerationStartSchema,
  digestGenerationSubscriptionSchema,
  digestInputSchema,
  feedSchema,
  feedRefreshStatusSchema,
  idSchema,
  importOpmlSchema,
  importResultSchema,
  okSchema,
  settingsSchema,
  settingsUpdateSchema,
  translationInputSchema,
  translationResultSchema,
} from '@daily-signal/domain';
import {
  providerConnectionSchema,
  providerCreateSchema,
  providerDiscoverResultSchema,
  providerDiscoverSchema,
  providerListSchema,
  providerModelRemoveSchema,
  providerModelSaveSchema,
  providerModelSchema,
  providerRemoveSchema,
  providerTestResultSchema,
  providerTestSchema,
  providerUpdateSchema,
  setDefaultProviderModelSchema,
} from '@daily-signal/domain/providers/schemas';

const procedure = oc.errors({
  BAD_REQUEST: {},
  NOT_FOUND: {},
  CONFLICT: {},
  PAYLOAD_TOO_LARGE: {},
  BAD_GATEWAY: {},
  GATEWAY_TIMEOUT: {},
  INTERNAL_SERVER_ERROR: {},
});
export const contract = {
  state: procedure.output(appStateSchema),
  feeds: {
    icon: procedure.input(idSchema).output(z.string().nullable()),
    add: procedure.input(addFeedSchema).output(feedSchema),
    update: procedure.input(feedUpdateSchema).output(feedSchema),
    remove: procedure.input(idSchema).output(okSchema),
    refresh: procedure.output(feedRefreshStatusSchema),
    status: procedure.output(feedRefreshStatusSchema.nullable()),
    import: procedure.input(importOpmlSchema).output(importResultSchema),
    export: procedure.output(z.object({ opml: z.string() })),
  },
  articles: {
    update: procedure.input(articleUpdateSchema).output(articleSchema),
    markRead: procedure
      .input(markArticlesReadSchema)
      .output(z.object({ updated: z.number().int().nonnegative() })),
  },
  settings: {
    save: procedure.input(settingsUpdateSchema).output(settingsSchema),
    saveAutomation: procedure.input(automationSettingsSchema).output(settingsSchema),
  },
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
  ai: {
    test: procedure.input(connectionSchema).output(okSchema),
    translate: procedure.input(translationInputSchema).output(translationResultSchema),
  },
  digests: {
    generate: procedure.input(digestInputSchema).output(digestGenerationStartSchema),
    subscribe: procedure
      .input(digestGenerationSubscriptionSchema)
      .output(eventIterator(digestGenerationEventSchema)),
    remove: procedure.input(idSchema).output(okSchema),
  },
};
