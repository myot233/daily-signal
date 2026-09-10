import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

function run(databasePath: string, code: string) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, DATABASE_PATH: databasePath }, encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('legacy database migrates URL, model, template, thinking and key exactly once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-signal-db-'));
  const databasePath = join(directory, 'state.sqlite');
  try {
    const legacyMigrations = join(directory, 'migrations');
    mkdirSync(join(legacyMigrations, 'meta'), { recursive: true });
    const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
    journal.entries = journal.entries.slice(0, 3);
    writeFileSync(join(legacyMigrations, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) {
      writeFileSync(join(legacyMigrations, `${entry.tag}.sql`), readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url)));
    }
    const legacy = new Database(databasePath);
    const value = { baseUrl: 'https://api.deepseek.com', model: 'existing-model', template: 'Keep my template', deepseekThinking: 'enabled' };
    try {
      migrate(drizzle(legacy), { migrationsFolder: legacyMigrations });
      legacy.prepare('INSERT INTO settings (id, value, api_key) VALUES (1, ?, ?)').run(JSON.stringify(value), 'RESTART-KEY-SENTINEL');
    } finally { legacy.close(); }

    const migrated = run(databasePath, `
      const { getState, getApiKey, sqlite } = await import('./server/db.ts');
      const state = getState();
      console.log(JSON.stringify({ state, keySurvived: getApiKey() === 'RESTART-KEY-SENTINEL', legacyKey: sqlite.prepare('SELECT api_key FROM settings WHERE id=1').get().api_key }));
      sqlite.close();
    `);
    assert.deepEqual(migrated.state.settings, value);
    assert.equal(migrated.state.providers.length, 1);
    assert.equal(migrated.state.providers[0].protocol, 'openai-chat-completions');
    assert.equal(migrated.state.providers[0].models[0].modelId, value.model);
    assert.equal(migrated.state.providers[0].options.maxOutputTokens, 16_384);
    assert.equal(migrated.state.hasApiKey, true);
    assert.equal(migrated.keySurvived, true);
    assert.equal(migrated.legacyKey, null);
    assert.equal(JSON.stringify(migrated).includes('RESTART-KEY-SENTINEL'), false);

    const restarted = run(databasePath, `
      const { getState, getApiKey, sqlite } = await import('./server/db.ts');
      console.log(JSON.stringify({ state: getState(), keySurvived: getApiKey() === 'RESTART-KEY-SENTINEL' }));
      sqlite.close();
    `);
    assert.equal(restarted.state.providers.length, 1);
    assert.equal(restarted.keySurvived, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('fresh database bootstraps once, while deleting all connections remains deleted after restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-signal-fresh-'));
  const databasePath = join(directory, 'state.sqlite');
  try {
    const first = run(databasePath, `
      const { getState, sqlite } = await import('./server/db.ts');
      console.log(JSON.stringify(getState())); sqlite.close();
    `);
    assert.equal(first.providers.length, 1);
    assert.equal(first.defaultProviderModelId, first.providers[0].models[0].id);
    run(databasePath, `
      const { sqlite } = await import('./server/db.ts');
      sqlite.prepare('UPDATE settings SET default_provider_model_id = NULL WHERE id=1').run();
      sqlite.prepare('DELETE FROM providers').run();
      console.log(JSON.stringify({ ok: true })); sqlite.close();
    `);
    const restarted = run(databasePath, `
      const { getState, sqlite } = await import('./server/db.ts');
      console.log(JSON.stringify(getState())); sqlite.close();
    `);
    assert.equal(restarted.providers.length, 0);
    assert.equal(restarted.defaultProviderModelId, null);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
