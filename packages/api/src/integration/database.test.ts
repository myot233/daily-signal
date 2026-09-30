import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { curationSettingsSchema } from '@daily-signal/domain/curation';

// Each subprocess selects its database before dynamically loading the initialization boundary.
function run(databasePath: string, code: string) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', code],
    {
      cwd: new URL('../../', import.meta.url),
      env: { ...process.env, DATABASE_PATH: databasePath },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('legacy database migrates URL, model, template, thinking and key exactly once', () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-signal-db-'));
  const databasePath = join(directory, 'state.sqlite');
  try {
    const legacyMigrations = join(directory, 'migrations');
    mkdirSync(join(legacyMigrations, 'meta'), { recursive: true });
    const journal = JSON.parse(
      readFileSync(
        new URL('../../../database/drizzle/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    );
    journal.entries = journal.entries.slice(0, 3);
    writeFileSync(join(legacyMigrations, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) {
      writeFileSync(
        join(legacyMigrations, `${entry.tag}.sql`),
        readFileSync(new URL(`../../../database/drizzle/${entry.tag}.sql`, import.meta.url)),
      );
    }
    const legacy = new Database(databasePath);
    const value = {
      baseUrl: 'https://api.deepseek.com',
      model: 'existing-model',
      template: 'Keep my template',
      deepseekThinking: 'enabled',
    };
    try {
      migrate(drizzle(legacy), { migrationsFolder: legacyMigrations });
      legacy
        .prepare('INSERT INTO settings (id, value, api_key) VALUES (1, ?, ?)')
        .run(JSON.stringify(value), 'RESTART-KEY-SENTINEL');
    } finally {
      legacy.close();
    }

    const migrated = run(
      databasePath,
      `
      const { sqlite } = await import('@daily-signal/database');
      const { getState } = await import('./src/state.ts');
      const { getApiKey } = await import('@daily-signal/settings');
      const state = getState();
      console.log(JSON.stringify({ state, keySurvived: getApiKey() === 'RESTART-KEY-SENTINEL', legacyKey: sqlite.prepare('SELECT api_key FROM settings WHERE id=1').get().api_key }));
      sqlite.close();
    `,
    );
    assert.deepEqual(migrated.state.settings, {
      ...value,
      autoDigest: { enabled: false, time: '20:00' },
      curation: curationSettingsSchema.parse({}),
    });
    assert.equal(migrated.state.providers.length, 1);
    assert.equal(migrated.state.providers[0].protocol, 'openai-chat-completions');
    assert.equal(migrated.state.providers[0].models[0].modelId, value.model);
    assert.equal(migrated.state.providers[0].options.maxOutputTokens, 16_384);
    assert.equal(migrated.state.hasApiKey, true);
    assert.equal(migrated.keySurvived, true);
    assert.equal(migrated.legacyKey, null);
    assert.equal(JSON.stringify(migrated).includes('RESTART-KEY-SENTINEL'), false);

    const restarted = run(
      databasePath,
      `
      const { sqlite } = await import('@daily-signal/database');
      const { getState } = await import('./src/state.ts');
      const { getApiKey } = await import('@daily-signal/settings');
      console.log(JSON.stringify({ state: getState(), keySurvived: getApiKey() === 'RESTART-KEY-SENTINEL' }));
      sqlite.close();
    `,
    );
    assert.equal(restarted.state.providers.length, 1);
    assert.equal(restarted.keySurvived, true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('fresh database bootstraps once, while deleting all connections remains deleted after restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-signal-fresh-'));
  const databasePath = join(directory, 'state.sqlite');
  try {
    const first = run(
      databasePath,
      `
      const { sqlite } = await import('@daily-signal/database');
      const { getState } = await import('./src/state.ts');
      console.log(JSON.stringify(getState())); sqlite.close();
    `,
    );
    assert.equal(first.providers.length, 1);
    assert.equal(first.defaultProviderModelId, first.providers[0].models[0].id);
    run(
      databasePath,
      `
      const { sqlite } = await import('@daily-signal/database');
      sqlite.prepare('UPDATE settings SET default_provider_model_id = NULL WHERE id=1').run();
      sqlite.prepare('DELETE FROM providers').run();
      console.log(JSON.stringify({ ok: true })); sqlite.close();
    `,
    );
    const restarted = run(
      databasePath,
      `
      const { sqlite } = await import('@daily-signal/database');
      const { getState } = await import('./src/state.ts');
      console.log(JSON.stringify(getState())); sqlite.close();
    `,
    );
    assert.equal(restarted.providers.length, 0);
    assert.equal(restarted.defaultProviderModelId, null);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('icon cache migration preserves subscriptions and cached bytes survive an offline restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-signal-icons-'));
  const databasePath = join(directory, 'state.sqlite');
  try {
    const legacyMigrations = join(directory, 'migrations');
    mkdirSync(join(legacyMigrations, 'meta'), { recursive: true });
    const journal = JSON.parse(
      readFileSync(
        new URL('../../../database/drizzle/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    );
    journal.entries = journal.entries.slice(0, 6);
    writeFileSync(join(legacyMigrations, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      writeFileSync(
        join(legacyMigrations, `${entry.tag}.sql`),
        readFileSync(new URL(`../../../database/drizzle/${entry.tag}.sql`, import.meta.url)),
      );
    const legacy = new Database(databasePath);
    try {
      migrate(drizzle(legacy), { migrationsFolder: legacyMigrations });
      legacy
        .prepare('INSERT INTO feeds (id, url, title, site_url, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(
          'saved-feed',
          'https://icons.example.com/rss',
          'My feed',
          'https://icons.example.com',
          '2026-09-28',
        );
    } finally {
      legacy.close();
    }
    const first = run(
      databasePath,
      `
      const { sqlite } = await import('@daily-signal/database');
      const { createFeedIconService } = await import('@daily-signal/feeds/icons');
      const body = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=', 'base64');
      const service = createFeedIconService({ fetchBytes: async () => ({ body, contentType: 'image/png', status: 200, ok: true }) });
      console.log(JSON.stringify({ icon: await service.getIcon('saved-feed'), feed: sqlite.prepare('SELECT title FROM feeds WHERE id = ?').get('saved-feed').title }));
      sqlite.close();
    `,
    );
    assert.equal(first.feed, 'My feed');
    assert.ok(first.icon.startsWith('data:image/png;base64,'));
    const restarted = run(
      databasePath,
      `
      const { sqlite } = await import('@daily-signal/database');
      const { createFeedIconService } = await import('@daily-signal/feeds/icons');
      let requests = 0;
      const service = createFeedIconService({ fetchBytes: async () => { requests++; throw new Error('offline'); } });
      console.log(JSON.stringify({ icon: await service.getIcon('saved-feed'), requests }));
      sqlite.close();
    `,
    );
    assert.equal(restarted.icon, first.icon);
    assert.equal(restarted.requests, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('reader migration preserves old feeds, articles and archived snapshots; flags survive restart', () => {
  const directory = mkdtempSync(join(tmpdir(), 'daily-signal-reader-'));
  const databasePath = join(directory, 'state.sqlite');
  try {
    const legacyMigrations = join(directory, 'migrations');
    mkdirSync(join(legacyMigrations, 'meta'), { recursive: true });
    const journal = JSON.parse(
      readFileSync(
        new URL('../../../database/drizzle/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    );
    journal.entries = journal.entries.slice(0, 7);
    writeFileSync(join(legacyMigrations, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      writeFileSync(
        join(legacyMigrations, `${entry.tag}.sql`),
        readFileSync(new URL(`../../../database/drizzle/${entry.tag}.sql`, import.meta.url)),
      );
    const legacy = new Database(databasePath);
    try {
      migrate(drizzle(legacy), { migrationsFolder: legacyMigrations });
      legacy
        .prepare(
          "INSERT INTO feeds (id, url, title, created_at) VALUES ('old-feed', 'https://reader.example.com/rss', 'Old feed', '2026-09-29')",
        )
        .run();
      legacy
        .prepare(
          "INSERT INTO articles (id, feed_id, title, url, content, published_at) VALUES ('old-article', 'old-feed', 'Saved article', 'https://reader.example.com/one', 'Saved body', '2026-09-29T00:00:00.000Z')",
        )
        .run();
      legacy
        .prepare(
          "INSERT INTO digests (id, date, title, markdown, created_at, article_count, model, sources) VALUES ('old-digest', '2026-09-29', 'Saved digest', '# Archived', '2026-09-29', 1, 'fixture', ?)",
        )
        .run(
          JSON.stringify([
            {
              id: 'old-article',
              feedId: 'old-feed',
              feedTitle: 'Old feed',
              title: 'Saved article',
              url: 'https://reader.example.com/one',
              content: 'Saved body',
              publishedAt: '2026-09-29T00:00:00.000Z',
              dateEstimated: false,
            },
          ]),
        );
    } finally {
      legacy.close();
    }
    const first = run(
      databasePath,
      `
      const { sqlite } = await import('@daily-signal/database');
      const { listArticles, updateArticle, updateFeed } = await import('@daily-signal/feeds/repository');
      const before = listArticles()[0];
      updateArticle({ id: 'old-article', read: true, starred: true });
      updateFeed({ id: 'old-feed', title: 'My feed', category: 'Saved group' });
      console.log(JSON.stringify({ before, sources: sqlite.prepare('SELECT sources FROM digests WHERE id=?').get('old-digest').sources })); sqlite.close();
    `,
    );
    assert.equal(first.before.readAt, null);
    assert.equal(first.before.starred, false);
    const restarted = run(
      databasePath,
      `
      const { sqlite } = await import('@daily-signal/database');
      const { getState } = await import('./src/state.ts');
      console.log(JSON.stringify({ state: getState(), sources: sqlite.prepare('SELECT sources FROM digests WHERE id=?').get('old-digest').sources })); sqlite.close();
    `,
    );
    assert.ok(restarted.state.articles[0].readAt);
    assert.equal(restarted.state.articles[0].starred, true);
    assert.equal(restarted.state.feeds[0].title, 'My feed');
    assert.equal(restarted.state.feeds[0].unreadCount, 0);
    assert.equal(restarted.state.feeds[0].category, 'Saved group');
    assert.equal(restarted.sources, first.sources);
    assert.equal(restarted.state.digests[0].sources[0].feedTitle, 'Old feed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
