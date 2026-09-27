import { defineConfig } from 'drizzle-kit';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '@daily-signal/config';

export default defineConfig({
  dialect: 'sqlite',
  schema: fileURLToPath(new URL('./src/schema.ts', import.meta.url)),
  out: relative(process.cwd(), fileURLToPath(new URL('./drizzle', import.meta.url))),
  dbCredentials: { url: config.database.path },
});
