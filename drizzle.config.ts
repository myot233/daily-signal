import { defineConfig } from 'drizzle-kit';
import { config } from './config';

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/infrastructure/database/schema.ts',
  out: './drizzle',
  dbCredentials: { url: config.database.path },
});
