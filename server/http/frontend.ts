import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { Express } from 'express';
import { resolve } from 'node:path';
import { config } from '../../config';

export async function mountFrontend(
  app: Express,
  server: Server,
): Promise<(() => Promise<void>) | undefined> {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  if (config.environment === 'production') {
    const dist = config.desktop.resources
      ? resolve(config.desktop.resources, 'dist')
      : fileURLToPath(new URL('../../dist/', import.meta.url));
    app.use(express.static(dist));
    app.get('/{*path}', (_req, res) => {
      res.sendFile(resolve(dist, 'index.html'));
    });
    return;
  }

  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  app.get('/{*path}', async (req, res, next) => {
    try {
      const html = await readFile(`${root}index.html`, 'utf8');
      res.type('html').send(await vite.transformIndexHtml(req.originalUrl, html));
    } catch (error) {
      next(error);
    }
  });
  return () => vite.close();
}
