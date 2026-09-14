import assert from 'node:assert/strict';
import { isAbsolute } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createConfig } from '../config';

test('config applies safe local defaults and resolves the database path from the project root', () => {
  const result = createConfig({});

  assert.equal(result.environment, 'development');
  assert.deepEqual(result.server, {
    host: '127.0.0.1',
    port: 3_000,
    shutdownTimeoutMs: 5_000,
  });
  assert.equal(isAbsolute(result.database.path), true);
  assert.equal(
    result.database.path,
    fileURLToPath(new URL('../data/daily-signal.sqlite', import.meta.url)),
  );
});

test('config accepts explicit environment values without resolving special database paths', () => {
  const result = createConfig({
    NODE_ENV: 'production',
    HOST: '::1',
    PORT: '4321',
    DATABASE_PATH: ':memory:',
    SHUTDOWN_TIMEOUT_MS: '10000',
  });

  assert.deepEqual(result, {
    environment: 'production',
    server: { host: '::1', port: 4_321, shutdownTimeoutMs: 10_000 },
    database: { path: ':memory:' },
  });
});

test('config rejects public listeners and malformed numeric values', () => {
  assert.throws(() => createConfig({ HOST: '0.0.0.0' }), /HOST/);
  assert.throws(() => createConfig({ PORT: '70000' }), /PORT/);
  assert.throws(() => createConfig({ SHUTDOWN_TIMEOUT_MS: 'later' }), /SHUTDOWN_TIMEOUT_MS/);
});
