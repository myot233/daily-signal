import { afterEach, expect } from 'vitest';
import { commands, page } from 'vitest/browser';
import { auditSpacing } from '../src/stories/ui-audit';
import type { SpacingIssue } from '../src/stories/ui-audit';

export type AuditReport = { test: string; width: number; issues: SpacingIssue[] };

declare module 'vitest/browser' {
  interface BrowserCommands {
    saveUiAudit(report: AuditReport): Promise<void>;
  }
}

afterEach(async ({ task }) => {
  if (task.result?.state === 'fail') return;
  const allIssues: string[] = [];
  // Storybook resets the viewport before play; resize after play to audit its resulting state.
  for (const width of [375, 640, 641, 950, 951, 1050, 1051, 1440]) {
    await page.viewport(width, 900);
    await document.fonts.ready;
    // Flush matchMedia React updates and layout, not an arbitrary time delay.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    expect(window.innerWidth).toBe(width);
    expect(document.querySelector('.app-shell')).not.toBeNull();
    const issues = auditSpacing();
    const marked = [...new Set(issues.map((issue) => issue.selector))].map((selector) => {
      const element = document.querySelector<HTMLElement>(selector);
      const outline = element?.style.outline ?? '';
      if (element) element.style.outline = '2px solid #e11d48';
      return { element, outline };
    });
    try {
      await commands.saveUiAudit({ test: task.name, width, issues });
    } finally {
      for (const { element, outline } of marked) if (element) element.style.outline = outline;
    }
    allIssues.push(
      ...issues.map((issue) => `${width}px [${issue.rule}] ${issue.selector}: ${issue.message}`),
    );
  }
  expect(
    allIssues,
    'UI spacing audit (screenshots and measurements: test-results/ui-audit)',
  ).toEqual([]);
});
