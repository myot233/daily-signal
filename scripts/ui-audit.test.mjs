import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { transform } from 'esbuild';
import { affectsUi } from './check-staged.mjs';

let browser;
let auditor;
before(async () => {
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL });
  auditor = await transform(
    await readFile(new URL('../apps/web/src/stories/ui-audit.ts', import.meta.url), 'utf8'),
    { loader: 'ts', format: 'iife', globalName: 'spacingAudit' },
  );
});
after(async () => {
  await browser?.close();
});

async function inspect(markup) {
  const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
  try {
    await page.setContent(
      `<style>*{box-sizing:border-box}body{margin:0}.compact-panel{padding:16px;width:300px}.app-content{padding:0 14px 16px;width:375px}[data-slot=card]{width:300px;border:1px solid;padding:16px}[data-slot=card-header],[data-slot=card-content]{padding:0}</style>${markup}`,
    );
    await page.addScriptTag({ content: auditor.code });
    return await page.evaluate(() => spacingAudit.auditSpacing());
  } finally {
    await page.close();
  }
}

test('detects horizontal overflow and zero or excessive/asymmetric padding', async () => {
  const issues = await inspect(
    '<main class="app-content" style="padding-left:0;padding-right:64px"><div style="width:500px">content</div></main>',
  );
  assert.ok(issues.some((issue) => issue.rule === 'horizontal-overflow'));
  assert.equal(issues.filter((issue) => issue.rule === 'padding-range').length, 2);
  assert.ok(issues.some((issue) => issue.rule === 'padding-symmetry'));
  assert.match(issues[0].selector, /main/);
  assert.equal(issues[0].rect.width, 375);
});

test('detects compounded card padding and misaligned sections', async () => {
  const issues = await inspect(
    '<div data-slot="card"><header data-slot="card-header" style="padding:0 24px">Title</header><div data-slot="card-content">Content</div></div>',
  );
  assert.ok(
    issues.some((issue) => issue.rule === 'padding-range' && issue.message.includes('40.0px')),
  );
  assert.ok(issues.some((issue) => issue.rule === 'section-alignment'));
});

test('allows balanced spacing, hidden content, and an intentionally scrollable code block', async () => {
  const issues = await inspect(
    '<main class="app-content"><div class="compact-panel"><pre style="overflow:auto">' +
      'long-code-'.repeat(80) +
      '</pre></div><div class="compact-panel" hidden style="padding:0;width:1000px"></div></main>',
  );
  assert.deepEqual(issues, []);
});

test('detects overlapping toolbar controls', async () => {
  const issues = await inspect(
    '<div class="reader-filters" style="display:flex"><button style="width:100px">First</button><button style="width:100px;margin-left:-20px">Second</button></div>',
  );
  assert.ok(issues.some((issue) => issue.rule === 'overlap'));
});

test('checks vertical padding and layout gaps', async () => {
  const issues = await inspect(
    '<div class="compact-panel" style="padding-top:0;padding-bottom:80px">Panel</div><div class="reader-filters" style="display:flex;gap:80px"><button>First</button><button>Second</button></div>',
  );
  assert.ok(issues.some((issue) => issue.message.includes('top padding 0.0px')));
  assert.ok(issues.some((issue) => issue.message.includes('bottom padding 80.0px')));
  assert.ok(issues.some((issue) => issue.rule === 'gap-range'));
});

test('measures drawer content insets and gives empty states a bounded spacing contract', async () => {
  assert.deepEqual(
    await inspect(
      '<div data-slot="dialog-content" data-variant="drawer"><div style="padding:12px 20px">Header</div><div style="padding:28px 20px">Body</div></div><div data-slot="card" data-spacing="empty-state" style="padding:40px">Empty</div>',
    ),
    [],
  );
  const broken = await inspect(
    '<div data-slot="dialog-content" data-variant="drawer"><div style="padding:0">Body against the edge</div></div><div data-slot="card" data-spacing="empty-state" style="padding:80px">Empty</div>',
  );
  assert.ok(
    broken.some(
      (issue) => issue.message.includes('effective left inset') && issue.message.includes('0.0px'),
    ),
  );
  assert.ok(broken.some((issue) => issue.message.includes('80.0px')));
});

test('staged change selection includes UI inputs and deletions, but not backend or prose', () => {
  for (const path of [
    'apps/web/src/styles.css',
    'packages/ui/src/components/card.tsx',
    'packages/client/src/state.ts',
    'pnpm-lock.yaml',
    '.husky/pre-commit',
    'scripts/ui-audit.test.mjs',
  ])
    assert.equal(affectsUi(path), true, path);
  for (const path of ['README.md', 'packages/database/src/index.ts', 'docs/ui-audit.md'])
    assert.equal(affectsUi(path), false, path);
});

test('lint-staged audits the index, restores local edits on failure, and includes deleted UI files', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'daily-signal-hook-'));
  // Hooks export Git paths (including a temporary index for pathspec commits).
  // The fixture must never write to the invoking repository's index or refs.
  const fixtureEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );
  const run = (command, args, options = {}) =>
    spawnSync(command, args, { cwd, env: fixtureEnv, encoding: 'utf8', ...options });
  const git = (...args) => {
    const result = run('git', args);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    git('init', '--quiet');
    git('config', 'user.email', 'hook-test@example.invalid');
    git('config', 'user.name', 'Hook Test');
    await mkdir(join(cwd, 'scripts'));
    await mkdir(join(cwd, 'apps/web/src'), { recursive: true });
    await cp(new URL('./check-staged.mjs', import.meta.url), join(cwd, 'scripts/check-staged.mjs'));
    // Deterministic process substitute: capture the tree seen by the actual hook task.
    await writeFile(
      join(cwd, 'scripts/probe.mjs'),
      `import{readFileSync,existsSync,writeFileSync}from'node:fs';const p='apps/web/src/styles.css';const s=existsSync(p)?readFileSync(p,'utf8'):'deleted';writeFileSync('observed.json',JSON.stringify({s,untracked:existsSync('scratch.txt')}));process.exit(s==='bad'?1:0);`,
    );
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({
        type: 'module',
        scripts: { 'ui:audit': 'node scripts/probe.mjs' },
        'lint-staged': { '*': 'node scripts/check-staged.mjs' },
      }),
    );
    await writeFile(join(cwd, '.gitignore'), 'observed.json\n');
    const css = join(cwd, 'apps/web/src/styles.css');
    await writeFile(css, 'good');
    git('add', '.');
    git('-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'fixture');
    await writeFile(css, 'bad');
    git('add', 'apps/web/src/styles.css');
    await writeFile(css, 'local fix');
    await writeFile(join(cwd, 'scratch.txt'), 'untracked work');
    // Use the installed lint-staged, with a local pnpm shim only for the formatter.
    const bin = await mkdtemp(join(tmpdir(), 'daily-signal-hook-bin-'));
    try {
      const realPnpm = run('which', ['pnpm']).stdout.trim();
      await writeFile(
        join(bin, 'pnpm'),
        `#!/bin/sh\nif [ "$1" = exec ]; then exit 0; fi\nexec '${realPnpm.replaceAll("'", "'\\''")}' "$@"\n`,
        { mode: 0o755 },
      );
      const lintStaged = new URL('../node_modules/lint-staged/bin/lint-staged.js', import.meta.url);
      const args = [fileURLToPath(lintStaged), '--hide-all', '--diff-filter=ACMRD'];
      const env = { ...fixtureEnv, PATH: `${bin}:${process.env.PATH}` };
      const failed = run(process.execPath, args, { env });
      assert.notEqual(failed.status, 0, failed.stdout);
      assert.deepEqual(JSON.parse(await readFile(join(cwd, 'observed.json'), 'utf8')), {
        s: 'bad',
        untracked: false,
      });
      assert.equal(git('show', ':apps/web/src/styles.css'), 'bad');
      assert.equal(await readFile(css, 'utf8'), 'local fix');
      assert.equal(await readFile(join(cwd, 'scratch.txt'), 'utf8'), 'untracked work');
      git('rm', '-f', 'apps/web/src/styles.css');
      const deleted = run(process.execPath, args, { env });
      assert.equal(deleted.status, 0, deleted.stderr + deleted.stdout);
      assert.equal(JSON.parse(await readFile(join(cwd, 'observed.json'), 'utf8')).s, 'deleted');
    } finally {
      await rm(bin, { recursive: true, force: true });
    }
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
