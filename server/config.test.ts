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
    desktop: { enabled: false, resources: undefined },
  });
});

test('config rejects public listeners and malformed numeric values', () => {
  assert.throws(() => createConfig({ HOST: '0.0.0.0' }), /HOST/);
  assert.throws(() => createConfig({ PORT: '70000' }), /PORT/);
  assert.throws(() => createConfig({ SHUTDOWN_TIMEOUT_MS: 'later' }), /SHUTDOWN_TIMEOUT_MS/);
});

test('desktop selects a free IPv4 loopback port independently of inherited web configuration', () => {
  const result = createConfig({
    DAILY_SIGNAL_DESKTOP: '1',
    DAILY_SIGNAL_RESOURCES: '/Application With Spaces/backend',
    DATABASE_PATH: '/User Data/daily-signal.sqlite',
    HOST: '0.0.0.0',
    PORT: 'not-a-port',
  });
  assert.equal(result.server.host, '127.0.0.1');
  assert.equal(result.server.port, 0);
  assert.equal(result.database.path, '/User Data/daily-signal.sqlite');
  assert.deepEqual(result.desktop, {
    enabled: true,
    resources: '/Application With Spaces/backend',
  });
});
