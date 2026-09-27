import { existsSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export function affectsUi(path) {
  return (
    /^(apps\/web\/|packages\/(ui|client|domain|contracts|typescript-config)\/|docs\/assets\/|scripts\/(ui-audit|check-staged))/.test(
      path,
    ) ||
    /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json|\.oxfmtrc\.json|\.oxlintrc\.json|\.husky\/pre-commit|\.github\/workflows\/check\.yml)$/.test(
      path,
    )
  );
}

export function checkStaged(files, run = (args) => spawnSync('pnpm', args, { stdio: 'inherit' })) {
  const present = files.filter((file) => existsSync(file));
  if (present.length) {
    const formatted = run(['exec', 'oxfmt', '--no-error-on-unmatched-pattern', ...present]);
    if (formatted.error || formatted.status !== 0) return formatted.status || 1;
  }
  if (files.some((file) => affectsUi(relative(process.cwd(), file).replaceAll('\\', '/')))) {
    const audited = run(['ui:audit']);
    return audited.error ? 1 : (audited.status ?? 1);
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = checkStaged(process.argv.slice(2));
