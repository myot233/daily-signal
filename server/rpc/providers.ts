import { testSavedProviderConnection } from '../modules/ai/service';
import { discoverModels } from '../modules/providers/discovery';
import {
  catalogResponse,
  createProvider,
  listProviders,
  removeProvider,
  removeProviderModel,
  saveProviderModel,
  setDefaultProviderModel,
  updateProvider,
} from '../modules/providers/repository';
import { getDefaultProviderModelId } from '../modules/settings/repository';
import { rpc } from './procedure';

export const providerProcedures = {
  list: rpc.providers.list.handler(() => ({
    catalog: catalogResponse(),
    providers: listProviders(),
    defaultProviderModelId: getDefaultProviderModelId(),
  })),
  create: rpc.providers.create.handler(({ input }) => createProvider(input)),
  update: rpc.providers.update.handler(({ input }) => updateProvider(input)),
  remove: rpc.providers.remove.handler(({ input }) => {
    removeProvider(input.id, input.revision);
    return { ok: true };
  }),
  discoverModels: rpc.providers.discoverModels.handler(({ input, context }) =>
    discoverModels(input.id, undefined, context.signal),
  ),
  test: rpc.providers.test.handler(({ input, context }) =>
    testSavedProviderConnection(input.providerId, input.modelId, { signal: context.signal }),
  ),
};

export const providerModelProcedures = {
  save: rpc.providerModels.save.handler(({ input }) => saveProviderModel(input)),
  remove: rpc.providerModels.remove.handler(({ input }) => {
    removeProviderModel(input.id);
    return { ok: true };
  }),
};

export const defaultModelProcedures = {
  set: rpc.defaultModel.set.handler(({ input }) => {
    setDefaultProviderModel(input.providerModelId);
    return { ok: true };
  }),
};
