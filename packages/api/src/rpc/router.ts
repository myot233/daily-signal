import { saveAutomationSettings, saveSettings } from '../settings';
import { getState } from '../state';
import { aiProcedures, digestProcedures } from './ai';
import { articleProcedures, feedProcedures } from './feeds';
import { implementer, rpc } from './procedure';
import { defaultModelProcedures, providerModelProcedures, providerProcedures } from './providers';

export const router = implementer.router({
  state: rpc.state.handler(() => getState()),
  feeds: feedProcedures,
  articles: articleProcedures,
  settings: {
    save: rpc.settings.save.handler(({ input }) => saveSettings(input)),
    saveAutomation: rpc.settings.saveAutomation.handler(({ input }) =>
      saveAutomationSettings(input),
    ),
  },
  providers: providerProcedures,
  providerModels: providerModelProcedures,
  defaultModel: defaultModelProcedures,
  ai: aiProcedures,
  digests: digestProcedures,
});
