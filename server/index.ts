import { createServer } from 'node:http';
import { config } from '../config';
import { createApp } from './http/app';
import { mountFrontend } from './http/frontend';
import { sqlite } from './infrastructure/database/client';
import {
  initializeDigestGenerationQueue,
  stopDigestGenerationQueue,
} from './modules/ai/generation-queue';
import {
  initializeDailyDigestScheduler,
  stopDailyDigestScheduler,
} from './modules/ai/daily-digest-scheduler';

initializeDigestGenerationQueue();
initializeDailyDigestScheduler();
const app = createApp();
const server = createServer(app);
const closeFrontend = await mountFrontend(app, server);
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `端口 ${config.server.port} 已被占用，请设置其他 PORT。`
      : 'HTTP 服务启动失败。',
  );
  process.exit(1);
});
server.listen(config.server.port, config.server.host, () => {
  const host = config.server.host === '::1' ? '[::1]' : config.server.host;
  console.log(`Daily Signal ready: http://${host}:${config.server.port}`);
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), config.server.shutdownTimeoutMs);
  deadline.unref();
  await closeFrontend?.();
  stopDailyDigestScheduler();
  await stopDigestGenerationQueue();
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
