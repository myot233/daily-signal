import { HttpError } from '../core/errors';
import { removeFeed } from '../modules/feeds/repository';
import { addFeed, exportOpml, importOpml, refreshFeeds } from '../modules/feeds/service';
import { rpc } from './procedure';

// Refresh and import share one process-wide guard because both ingest feeds.
let refreshing = false;
async function runIngestion<T>(operation: () => Promise<T>): Promise<T> {
  if (refreshing) throw new HttpError(409, '订阅正在刷新或导入，请等待完成。');
  refreshing = true;
  try {
    return await operation();
  } finally {
    refreshing = false;
  }
}

export const feedProcedures = {
  add: rpc.feeds.add.handler(({ input }) => addFeed(input.url, input.category)),
  remove: rpc.feeds.remove.handler(({ input }) => {
    removeFeed(input.id);
    return { ok: true };
  }),
  refresh: rpc.feeds.refresh.handler(() => runIngestion(refreshFeeds)),
  import: rpc.feeds.import.handler(({ input }) => runIngestion(() => importOpml(input.opml))),
  export: rpc.feeds.export.handler(() => ({ opml: exportOpml() })),
};
