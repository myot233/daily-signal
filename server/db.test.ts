import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

test('legacy database upgrades without losing configuration and retains keys across process restarts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-signal-db-'));
  const databasePath = join(directory, 'state.sqlite');
  try {
    const legacyMigrations = join(directory, 'migrations');
    mkdirSync(join(legacyMigrations, 'meta'), { recursive: true });
    const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8'));
    journal.entries = journal.entries.slice(0, 2);
    writeFileSync(join(legacyMigrations, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) {
      writeFileSync(join(legacyMigrations, `${entry.tag}.sql`), readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url)));
    }
    const legacy = new Database(databasePath);
    const value = { baseUrl: 'https://api.deepseek.com', model: 'existing-model', template: 'Keep my template', deepseekThinking: 'enabled' };
    try {
      migrate(drizzle(legacy), { migrationsFolder: legacyMigrations });
      legacy.prepare('INSERT INTO settings (id, value) VALUES (1, ?)').run(JSON.stringify(value));
    } finally { legacy.close(); }

    function run(code: string) {
      const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
        cwd: new URL('../', import.meta.url), env: { ...process.env, DATABASE_PATH: databasePath }, encoding: 'utf8',
      });
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout);
    }
    const migrated = run(`
      const { getState, sqlite } = await import('./server/db.ts');
      console.log(JSON.stringify(getState()));
      sqlite.prepare('UPDATE settings SET api_key = ? WHERE id = 1').run('RESTART-KEY-SENTINEL');
      sqlite.close();
    `);
    assert.deepEqual(migrated.settings, value);
    assert.equal(migrated.hasApiKey, false);
    const restarted = run(`
      const { getState, getApiKey, sqlite } = await import('./server/db.ts');
      console.log(JSON.stringify({ state: getState(), keySurvived: getApiKey() === 'RESTART-KEY-SENTINEL' }));
      sqlite.close();
    `);
    assert.deepEqual(restarted.state.settings, value);
    assert.equal(restarted.state.hasApiKey, true);
    assert.equal(restarted.keySurvived, true);
    assert.equal(JSON.stringify(restarted).includes('RESTART-KEY-SENTINEL'), false);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
