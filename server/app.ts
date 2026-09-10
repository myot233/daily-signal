import express from 'express';
import { BodyLimitPlugin, RPCHandler } from '@orpc/server/node';
import { router } from './router';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const portSuffix = req.socket.localPort === 80 ? '' : `:${req.socket.localPort}`;
    const localHost = req.headers.host === `localhost${portSuffix}` || req.headers.host === `127.0.0.1${portSuffix}`;
    if (!localHost || req.headers['sec-fetch-site'] === 'cross-site') {
      res.status(403).json({ error: '仅允许本地同源访问。' });
      return;
    }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
      res.status(403).json({ error: '跨域请求已拒绝。' });
      return;
    }
    next();
  });
  const handler = new RPCHandler(router, { plugins: [new BodyLimitPlugin({ maxBodySize: 3 * 1024 * 1024 })] });
  app.use('/rpc{/*path}', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST' || !req.is('application/json')) {
      res.status(400).json({ error: 'RPC 请求必须使用 POST application/json。' });
      return;
    }
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    req.once('aborted', cancel);
    res.once('close', cancel);
    try {
      const { matched } = await handler.handle(req, res, { prefix: '/rpc', context: { signal: controller.signal } });
      if (!matched) res.status(404).json({ error: '接口不存在。' });
    } catch {
      if (!res.headersSent && !res.destroyed) res.status(500).json({ error: '请求处理失败，请稍后重试。' });
    } finally {
      req.off('aborted', cancel);
      res.off('close', cancel);
    }
  });
  return app;
}
