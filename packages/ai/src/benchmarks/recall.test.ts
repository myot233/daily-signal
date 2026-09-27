import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { benchmarkInput, readBenchmarkJson, scoreRecall } from './recall';

function result(...groups: string[][]) {
  return {
    benchmarkId: benchmarkInput.id,
    kind: 'manual',
    curation: { cards: groups.map((sourceIds) => ({ sourceIds })) },
  };
}

test('example reports event recall, precision and actionable omissions', () => {
  const score = scoreRecall(readBenchmarkJson('example-result.json'));
  assert.equal(score.articleCount, 16);
  assert.equal(score.expectedEventCount, 8);
  assert.equal(score.recalledEventCount, 6);
  assert.equal(score.recall, 0.75);
  assert.equal(score.precision, 6 / 7);
  assert.equal(score.baseline.passed, false);
  assert.deepEqual(score.baseline.checks, { recall: false, precision: true, cardCount: true });
  assert.deepEqual(
    score.missed.map((event) => event.sourceIds),
    [['r13'], ['r15']],
  );
  assert.deepEqual(
    score.unexpected.map((event) => event.sourceIds),
    [['r02']],
  );
});

test('duplicate reports and repeated cards count once; alternative sources count as hits', () => {
  const first = scoreRecall(result(['r01'], ['r08']));
  const repeated = scoreRecall(result(['r01', 'r09'], ['r09'], ['r08', 'r16']));
  assert.equal(first.recall, 2 / 8);
  assert.equal(repeated.recall, first.recall);
  assert.equal(repeated.precision, 1);
  assert.equal(scoreRecall(result(['r09'], ['r16'])).recall, first.recall);
});

test('empty selection is zero and selecting everything cannot hide noise behind recall', () => {
  const empty = scoreRecall(result());
  assert.equal(empty.recall, 0);
  assert.equal(empty.precision, 0);
  assert.equal(empty.missed.length, 8);
  const all = scoreRecall(result(...benchmarkInput.articles.map((article) => [article.id])));
  assert.equal(all.recall, 1);
  assert.equal(all.precision, 8 / 14);
  assert.equal(all.unexpected.length, 6);
});

test('scores only selected cards, rejects wrong fixtures, malformed results and unknown IDs', () => {
  assert.equal(scoreRecall({ ...result(), sources: benchmarkInput.articles }).recall, 0);
  assert.throws(() => scoreRecall(result(['invented-id'])), /未知来源 ID/);
  assert.throws(() => scoreRecall({ ...result(['r01']), benchmarkId: 'another-dataset' }));
  assert.throws(() =>
    scoreRecall({ benchmarkId: benchmarkInput.id, sources: benchmarkInput.articles }),
  );
  assert.throws(() => scoreRecall(result([])));
});

test('baseline includes exact recall and precision boundaries and enforces the card budget', () => {
  const positives = ['r01', 'r03', 'r04', 'r06', 'r08', 'r10', 'r13', 'r15'];
  const atRecallLimit = scoreRecall(result(...positives.slice(0, 7).map((id) => [id]), ['r02']));
  assert.equal(atRecallLimit.recall, 0.875);
  assert.equal(atRecallLimit.baseline.passed, true);
  const atPrecisionLimit = scoreRecall(result(...positives.map((id) => [id]), ['r02'], ['r05']));
  assert.equal(atPrecisionLimit.precision, 0.8);
  assert.equal(atPrecisionLimit.cardCount, 10);
  assert.equal(atPrecisionLimit.baseline.passed, true);
  const belowPrecision = scoreRecall(
    result(...positives.slice(0, 7).map((id) => [id]), ['r02'], ['r05']),
  );
  assert.equal(belowPrecision.baseline.checks.precision, false);
  assert.equal(belowPrecision.baseline.passed, false);
  const overBudget = scoreRecall(result(...positives.map((id) => [id]), ['r01'], ['r01'], ['r01']));
  assert.equal(overBudget.recall, 1);
  assert.equal(overBudget.precision, 1);
  assert.equal(overBudget.baseline.checks.cardCount, false);
  assert.equal(overBudget.baseline.passed, false);
});

test('CLI check exits unsuccessfully below baseline and succeeds when all gates pass', () => {
  const directory = mkdtempSync(join(tmpdir(), 'rss-recall-score-'));
  const path = join(directory, 'result.json');
  const cli = fileURLToPath(new URL('./recall-cli.ts', import.meta.url));
  try {
    for (const [selection, expectedStatus] of [
      [result(['r01']), 1],
      [result(...['r01', 'r03', 'r04', 'r06', 'r08', 'r10', 'r13'].map((id) => [id])), 0],
    ] as const) {
      writeFileSync(path, JSON.stringify(selection));
      const child = spawnSync(process.execPath, ['--import', 'tsx', cli, path, '--check'], {
        encoding: 'utf8',
        timeout: 10_000,
      });
      assert.equal(child.status, expectedStatus, child.stderr);
      const score = JSON.parse(child.stdout) as { baseline: { passed: boolean } };
      assert.equal(score.baseline.passed, expectedStatus === 0);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
