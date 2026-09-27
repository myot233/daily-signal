import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const envFile = resolve(projectRoot, '.env');

if (process.env.DAILY_SIGNAL_DESKTOP !== '1' && existsSync(envFile)) loadEnvFile(envFile);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  DATABASE_PATH: z.string().trim().min(1).default('./data/daily-signal.sqlite'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(5_000),
  DAILY_SIGNAL_DESKTOP: z.enum(['0', '1']).default('0'),
  DAILY_SIGNAL_RESOURCES: z.string().trim().min(1).optional(),
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
  desktop: {
    enabled: boolean;
    resources: string | undefined;
  };
}

export function createConfig(environment: NodeJS.ProcessEnv): AppConfig {
  const desktop = environment.DAILY_SIGNAL_DESKTOP === '1';
  const result = environmentSchema.safeParse(
    desktop ? { ...environment, HOST: '127.0.0.1', PORT: '3000' } : environment,
  );
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
      port: desktop ? 0 : result.data.PORT,
      shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
    },
    database: {
      path:
        databasePath === ':memory:' || isAbsolute(databasePath)
          ? databasePath
          : resolve(projectRoot, databasePath),
    },
    desktop: {
      enabled: desktop,
      resources: result.data.DAILY_SIGNAL_RESOURCES,
    },
  };
}

export const config = createConfig(process.env);
