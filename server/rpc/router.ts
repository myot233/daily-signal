import { saveSettings } from '../modules/settings/service';
import { getState } from '../modules/state/service';
import { aiProcedures, digestProcedures } from './ai';
import { feedProcedures } from './feeds';
import { implementer, rpc } from './procedure';
import { defaultModelProcedures, providerModelProcedures, providerProcedures } from './providers';

export const router = implementer.router({
  state: rpc.state.handler(() => getState()),
  feeds: feedProcedures,
  settings: {
    save: rpc.settings.save.handler(({ input }) => saveSettings(input)),
  },
  providers: providerProcedures,
  providerModels: providerModelProcedures,
  defaultModel: defaultModelProcedures,
  ai: aiProcedures,
  digests: digestProcedures,
});
