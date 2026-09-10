import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import Database from 'better-sqlite3';

test('workflow migration preserves existing digests with an empty execution history', () => {
  const sqlite = new Database(':memory:');
  try {
    sqlite.exec(readFileSync(new URL('../drizzle/0000_colossal_overlord.sql', import.meta.url), 'utf8'));
    sqlite.prepare('INSERT INTO digests (id, date, title, markdown, created_at, article_count, model, sources) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('old', '2026-09-09', 'Archived title', 'Original report', '2026-09-09T12:00:00Z', 1, 'old-model', '[{"id":"source"}]');
    sqlite.exec(readFileSync(new URL('../drizzle/0002_real_mantis.sql', import.meta.url), 'utf8'));
    assert.deepEqual(sqlite.prepare('SELECT id, markdown, sources, workflow FROM digests').get(), {
      id: 'old', markdown: 'Original report', sources: '[{"id":"source"}]', workflow: '[]',
    });
  } finally { sqlite.close(); }
});
