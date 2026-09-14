import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const envFile = resolve(projectRoot, '.env');

if (existsSync(envFile)) loadEnvFile(envFile);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  DATABASE_PATH: z.string().trim().min(1).default('./data/daily-signal.sqlite'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(5_000),
});

export interface AppConfig {
  environment: 'development' | 'production' | 'test';
  server: {
    host: '127.0.0.1' | '::1';
    port: number;
    shutdownTimeoutMs: number;
  };
  database: {
    path: string;
  };
}

export function createConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`环境变量配置无效：${details}`);
  }

  const databasePath = result.data.DATABASE_PATH;
  return {
    environment: result.data.NODE_ENV,
    server: {
      host: result.data.HOST,
      port: result.data.PORT,
      shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
    },
    database: {
      path:
        databasePath === ':memory:' || isAbsolute(databasePath)
          ? databasePath
          : resolve(projectRoot, databasePath),
    },
  };
}

export const config = createConfig(process.env);
