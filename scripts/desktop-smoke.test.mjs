import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const triple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)[1];

test(
  'relocated desktop backend starts without system Node, keeps data, rejects cross-origin requests and exits on parent EOF',
  { timeout: 60_000 },
  async (t) => {
    const folder = await mkdtemp(join(tmpdir(), 'daily-signal-desktop-'));
    const resources = join(folder, 'Application With Spaces', 'backend');
    const data = join(folder, 'User Data');
    await mkdir(data, { recursive: true });
    await cp(join(root, '.desktop/resources'), resources, { recursive: true });
    const node = join(folder, 'daily-signal-node');
    await cp(join(root, `src-tauri/binaries/daily-signal-node-${triple}`), node);
    t.after(() => rm(folder, { recursive: true, force: true }));
    async function start() {
      const child = spawn(node, [join(resources, 'server.mjs')], {
        cwd: data,
        env: {
          PATH: '/usr/bin:/bin',
          NODE_ENV: 'production',
          DAILY_SIGNAL_DESKTOP: '1',
          DAILY_SIGNAL_RESOURCES: resources,
          DATABASE_PATH: join(data, 'daily-signal.sqlite'),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      t.after(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      });
      let errors = '';
      child.stderr.on('data', (chunk) => {
        errors += chunk;
      });
      const exited = once(child, 'exit');
      const lines = createInterface({ input: child.stdout });
      const readiness = (async () => {
        for await (const line of lines) {
          const message = JSON.parse(line);
          if (message.event === 'ready') return message.url;
        }
        throw new Error(`Backend exited before readiness: ${errors}`);
      })();
      const url = await readiness;
      return {
        url,
        async stop() {
          child.stdin.end();
          const [code] = await exited;
          assert.equal(code, 0, errors);
        },
      };
    }
    const first = await start();
    async function rpc(url, route, json) {
      const response = await fetch(`${url}/rpc/${route}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json }),
      });
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).json;
    }
    const page = await fetch(`${first.url}/archive`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<div id="root">/);
    const initial = await rpc(first.url, 'state');
    assert.equal(initial.feeds.length, 0);
    await rpc(first.url, 'settings/save', {
      ...initial.settings,
      template: 'Desktop persistence check',
    });
    const denied = await fetch(`${first.url}/rpc/state`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.com',
      },
      body: '{}',
    });
    assert.equal(denied.status, 403);
    await first.stop();
    await assert.rejects(fetch(first.url));
    const second = await start();
    assert.equal((await rpc(second.url, 'state')).settings.template, 'Desktop persistence check');
    await second.stop();
  },
);
