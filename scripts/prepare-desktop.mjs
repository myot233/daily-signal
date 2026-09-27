import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.desktop/resources');
const cache = join(root, '.desktop/cache');
const require = createRequire(import.meta.url);
if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) {
  throw new Error('目前桌面打包支持 macOS（Apple Silicon / Intel），请在目标架构的 Mac 上构建。');
}
const triple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
const expectedTriple = `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
if (triple !== expectedTriple)
  throw new Error('Node.js 和 Rust 的架构不同，请使用相同架构的工具链。');
await mkdir(cache, { recursive: true });
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ['server/index.ts'],
  outfile: join(output, 'server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  external: ['better-sqlite3', 'vite'],
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
await cp(join(root, 'dist'), join(output, 'dist'), { recursive: true });
await cp(join(root, 'drizzle'), join(output, 'drizzle'), { recursive: true });
// Keep the native SQLite addon outside the JS bundle, including its runtime dependencies.
const copied = new Set();
async function copyPackage(name, from = require) {
  if (copied.has(name)) return;
  copied.add(name);
  const manifest = from.resolve(`${name}/package.json`);
  const folder = dirname(manifest);
  const pkg = JSON.parse(await readFile(manifest, 'utf8'));
  await cp(folder, join(output, 'node_modules', name), {
    recursive: true,
    dereference: true,
    filter: (path) => !path.startsWith(join(folder, 'node_modules')),
  });
  for (const dependency of Object.keys(pkg.dependencies ?? {})) {
    await copyPackage(dependency, createRequire(manifest));
  }
}
await copyPackage('better-sqlite3');

// Reuse a standalone runtime when available; never ship Homebrew's linked executable.
const candidate = process.env.DAILY_SIGNAL_NODE_BINARY ?? process.execPath;
const candidateInfo = JSON.parse(
  execFileSync(candidate, ['-p', 'JSON.stringify({version:process.version,arch:process.arch})'], {
    encoding: 'utf8',
  }),
);
if (
  candidateInfo.arch !== process.arch ||
  Number(candidateInfo.version.slice(1).split('.')[0]) < 24
) {
  throw new Error('桌面 Node.js 运行环境必须为 24+，且架构与构建机一致。');
}
const linkedLibraries = execFileSync('otool', ['-L', candidate], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => line.trim().split(' (')[0]);
const standalone =
  linkedLibraries.length > 0 &&
  linkedLibraries.every(
    (path) => path.startsWith('/usr/lib/') || path.startsWith('/System/Library/'),
  );
let runtimeBinary = candidate;
let runtimeLicense = join(dirname(dirname(candidate)), 'LICENSE');
let runtimeVersion = candidateInfo.version;
if (!standalone) {
  // Homebrew's Node links to Homebrew libraries. Download the official standalone runtime.
  const archiveName = `node-${process.version}-darwin-${process.arch}.tar.gz`;
  const archivePath = join(cache, archiveName);
  const base = `https://nodejs.org/dist/${process.version}/`;
  async function download(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(900_000) });
    if (!response.ok) throw new Error(`下载运行环境失败：${response.status} ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }
  const sums = (await download(`${base}SHASUMS256.txt`)).toString();
  const expected = sums
    .split('\n')
    .find((line) => line.trim().endsWith(`  ${archiveName}`))
    ?.split(/\s+/)[0];
  if (!expected) throw new Error(`官方校验清单中找不到 ${archiveName}`);
  let archive;
  try {
    archive = await readFile(archivePath);
  } catch {
    /* Not cached yet. */
  }
  if (!archive || createHash('sha256').update(archive).digest('hex') !== expected) {
    console.log(`下载独立 Node.js ${process.version} 运行环境…`);
    archive = await download(`${base}${archiveName}`);
    if (createHash('sha256').update(archive).digest('hex') !== expected)
      throw new Error('Node.js 下载校验失败。');
    await writeFile(archivePath, archive);
  }
  execFileSync('tar', ['-xzf', archivePath, '-C', cache]);
  const extracted = join(cache, archiveName.replace(/\.tar\.gz$/, ''));
  runtimeBinary = join(extracted, 'bin/node');
  runtimeLicense = join(extracted, 'LICENSE');
  runtimeVersion = process.version;
}
await cp(runtimeLicense, join(output, 'NODE-LICENSE'));
const binaryDir = join(root, 'src-tauri/binaries');
await mkdir(binaryDir, { recursive: true });
const binary = join(binaryDir, `daily-signal-node-${triple}`);
await cp(runtimeBinary, binary);
await chmod(binary, 0o755);
execFileSync(
  binary,
  [
    '--input-type=commonjs',
    '-e',
    'const Database=require("better-sqlite3"); const db=new Database(":memory:"); db.prepare("SELECT 1").get(); db.close();',
  ],
  { cwd: output, stdio: 'inherit' },
);
await writeFile(
  join(output, 'runtime.json'),
  `${JSON.stringify({ node: runtimeVersion, target: triple }, null, 2)}\n`,
);
console.log(`桌面资源已准备：${resolve(output)}`);
