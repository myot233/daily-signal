import { createServer } from 'node:http';
import { config } from '@daily-signal/config';
import { createApp } from '@daily-signal/api';
import { mountFrontend } from './frontend';
import { sqlite } from '@daily-signal/database';
import {
  initializeDigestGenerationQueue,
  stopDigestGenerationQueue,
} from '@daily-signal/ai/generation-queue';
import {
  initializeDailyDigestScheduler,
  stopDailyDigestScheduler,
} from '@daily-signal/ai/daily-digest-scheduler';

const desktop = config.desktop.enabled;
const port = config.server.port;
initializeDigestGenerationQueue();
initializeDailyDigestScheduler();
const app = createApp();
const server = createServer(app);
const closeFrontend = await mountFrontend(app, server);
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? `端口 ${port} 已被占用，请设置其他 PORT。`
      : 'HTTP 服务启动失败。',
  );
  process.exit(1);
});
server.listen(port, config.server.host, () => {
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('无法读取本地服务地址。');
  const host = config.server.host === '::1' ? '[::1]' : config.server.host;
  const url = `http://${host}:${address.port}`;
  console.log(desktop ? JSON.stringify({ event: 'ready', url }) : `Daily Signal ready: ${url}`);
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
// The desktop parent owns stdin. EOF also stops the backend if the app crashes.
if (desktop) {
  process.stdin.resume();
  process.stdin.once('end', shutdown);
}
