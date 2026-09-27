import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import type { BrowserCommandContext } from 'vitest/node';
import type { AuditReport } from './.storybook/ui-audit.setup';
import viteConfig from './vite.config';

const output = fileURLToPath(new URL('./test-results/ui-audit/', import.meta.url));

export default mergeConfig(
  viteConfig,
  defineConfig({
    cacheDir: 'node_modules/.vite/ui-audit',
    optimizeDeps: { include: ['@tanstack/react-query'] },
    plugins: [
      storybookTest({
        configDir: fileURLToPath(new URL('./.storybook', import.meta.url)),
        tags: { include: ['ui-audit'] },
      }),
    ],
    test: {
      name: 'ui-audit',
      testTimeout: 30_000,
      hookTimeout: 30_000,
      maxWorkers: 2,
      setupFiles: ['./.storybook/vitest.setup.ts', './.storybook/ui-audit.setup.ts'],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({
          launchOptions: { channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL },
          contextOptions: { reducedMotion: 'reduce', locale: 'zh-CN', timezoneId: 'Asia/Shanghai' },
        }),
        instances: [{ browser: 'chromium' }],
        screenshotDirectory: './test-results/ui-audit/failures',
        commands: {
          async saveUiAudit(context: BrowserCommandContext, report: AuditReport) {
            // Browser input never becomes a filesystem path.
            const id = createHash('sha256')
              .update(`${context.testPath}:${report.test}:${report.width}`)
              .digest('hex')
              .slice(0, 20);
            await mkdir(output, { recursive: true });
            await writeFile(
              `${output}/${id}.json`,
              JSON.stringify(
                {
                  ...report,
                  source: context.testPath,
                  screenshot: report.issues.length ? `${id}.png` : null,
                },
                null,
                2,
              ),
            );
            if (report.issues.length)
              await context.iframe.locator('body').screenshot({
                path: `${output}/${id}.png`,
                animations: 'disabled',
              });
          },
        },
      },
    },
  }),
);
