import { removeFeed } from '../modules/feeds/repository';
import { addFeed, exportOpml } from '../modules/feeds/service';
import { feedIngestion } from '../modules/feeds/ingestion';
import { rpc } from './procedure';

export const feedProcedures = {
  add: rpc.feeds.add.handler(({ input }) => addFeed(input.url, input.category)),
  remove: rpc.feeds.remove.handler(({ input }) => {
    removeFeed(input.id);
    return { ok: true };
  }),
  refresh: rpc.feeds.refresh.handler(() => feedIngestion.startRefresh()),
  status: rpc.feeds.status.handler(() => feedIngestion.getStatus()),
  import: rpc.feeds.import.handler(({ input }) => feedIngestion.import(input.opml)),
  export: rpc.feeds.export.handler(() => ({ opml: exportOpml() })),
};
