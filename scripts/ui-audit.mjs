import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../apps/web/test-results/ui-audit/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
function run(command, args) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
  return new Promise((resolve) => {
    child.on('error', (error) => {
      console.error(error);
      resolve(1);
    });
    child.on('exit', (code) => resolve(code ?? 1));
  });
}
const regressions = await run(process.execPath, ['--test', 'scripts/ui-audit.test.mjs']);
const status =
  regressions !== 0
    ? regressions
    : await run('pnpm', [
        '--filter',
        '@daily-signal/web',
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.ui-audit.config.ts',
        '--reporter=default',
        '--reporter=json',
        '--outputFile=test-results/ui-audit/vitest.json',
      ]);
const reports = [];
const files = await readdir(output);
for (const name of files) {
  if (name.endsWith('.json') && name !== 'vitest.json')
    reports.push(JSON.parse(await readFile(new URL(name, output), 'utf8')));
}
reports.sort((a, b) => a.test.localeCompare(b.test) || a.width - b.width);
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const failures = reports.filter((report) => report.issues.length);
const diagnostics = files.includes('vitest.json')
  ? 'Interaction, accessibility and runtime failures are recorded in <a href="vitest.json">Vitest results</a>.'
  : 'The audit could not finish. See the command log for regression or startup errors.';
const rows = reports
  .map(
    (report) =>
      `<tr><td>${escape(report.test)}</td><td>${report.width}px</td><td>${report.issues.length ? `${report.issues.length} issues` : 'Pass'}</td></tr>`,
  )
  .join('');
const details = failures
  .map(
    (report) =>
      `<section><h2>${escape(report.test)} · ${report.width}px</h2><p>${escape(report.source)}</p><ul>${report.issues.map((issue) => `<li><strong>${escape(issue.rule)}</strong>: ${escape(issue.message)}<pre>${escape(issue.selector)}</pre></li>`).join('')}</ul><a href="${escape(report.screenshot)}"><img alt="Outlined spacing issues" src="${escape(report.screenshot)}"></a></section>`,
  )
  .join('');
await writeFile(
  new URL('index.html', output),
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>UI spacing audit</title><style>body{font:15px system-ui;max-width:1100px;margin:40px auto;padding:0 24px;color:#292a2c}table{border-collapse:collapse;width:100%}td,th{text-align:left;border-bottom:1px solid #ddd;padding:8px}img{max-width:100%;border:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{margin-top:40px}</style><h1>UI spacing audit — ${status === 0 && reports.length ? 'passed' : 'failed'}</h1><p>${reports.length} viewport checks; ${failures.length} with spacing issues. ${diagnostics}</p><table><thead><tr><th>Story</th><th>Viewport</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>${details}</html>`,
);
console.log(`UI audit report: ${fileURLToPath(new URL('index.html', output))}`);
process.exitCode = status === 0 && reports.length === 0 ? 1 : status;
