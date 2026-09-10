import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createApp } from './app';
import { sqlite } from './db';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1–65535 的整数。');
const app = createApp();
const server = createServer(app);
const root = fileURLToPath(new URL('../', import.meta.url));
let closeVite: (() => Promise<void>) | undefined;
if (process.env.NODE_ENV === 'production') {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => { res.sendFile(`${dist}index.html`); });
} else {
  const vite = await createViteServer({ root, server: { middlewareMode: true, hmr: { server } }, appType: 'custom' });
  closeVite = () => vite.close();
  app.use(vite.middlewares);
  app.get('/{*path}', async (req, res, next) => {
    try {
      const html = await readFile(`${root}index.html`, 'utf8');
      res.type('html').send(await vite.transformIndexHtml(req.originalUrl, html));
    } catch (error) { next(error); }
  });
}
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请设置其他 PORT。` : 'HTTP 服务启动失败。');
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => { console.log(`Daily Signal ready: http://127.0.0.1:${port}`); });
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 5_000);
  deadline.unref();
  await closeVite?.();
  server.close(() => { sqlite.close(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
