import { createServer } from 'node:http';
import { createApp } from './http/app';
import { mountFrontend } from './http/frontend';
import { sqlite } from './infrastructure/database/client';
import {
  initializeDigestGenerationQueue,
  stopDigestGenerationQueue,
} from './modules/ai/generation-queue';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT 必须是 1–65535 的整数。');
initializeDigestGenerationQueue();
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
server.listen(port, '127.0.0.1', () => {
  console.log(`Daily Signal ready: http://127.0.0.1:${port}`);
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 5_000);
  deadline.unref();
  await closeFrontend?.();
  await stopDigestGenerationQueue();
  server.close(() => {
    sqlite.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
