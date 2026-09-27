export type SpacingIssue = {
  rule: string;
  selector: string;
  message: string;
  rect: { x: number; y: number; width: number; height: number };
};

const tolerance = 1;
const boundaries =
  '.app-content, .view-heading, .reader-filters, .reader-panes, .reader-detail, .article-row, .compact-panel, .today-workspace, .settings-workspace, [data-slot="card"], [data-slot="dialog-content"]';

function visible(element: HTMLElement) {
  const style = getComputedStyle(element);
  return (
    element.getClientRects().length > 0 &&
    style.visibility !== 'hidden' &&
    !element.closest('[aria-hidden="true"]')
  );
}

function selectorFor(element: HTMLElement): string {
  if (element.id) return `#${CSS.escape(element.id)}`;
  const parts: string[] = [];
  let node: HTMLElement | null = element;
  while (node && node !== document.body) {
    const slot = node.dataset.slot;
    const parent: HTMLElement | null = node.parentElement;
    const index = parent ? Array.from(parent.children).indexOf(node) + 1 : 1;
    parts.unshift(
      `${node.tagName.toLowerCase()}${slot ? `[data-slot="${CSS.escape(slot)}"]` : ''}:nth-child(${index})`,
    );
    if (node.id) {
      parts[0] = `#${CSS.escape(node.id)}`;
      break;
    }
    node = parent;
  }
  return parts.join(' > ');
}

/** Geometry contracts for this compact UI; no screenshot baseline or model score. */
export function auditSpacing(root: ParentNode = document): SpacingIssue[] {
  const issues: SpacingIssue[] = [];
  const add = (element: HTMLElement, rule: string, message: string) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    issues.push({ rule, selector: selectorFor(element), message, rect: { x, y, width, height } });
  };
  const range = (element: HTMLElement, label: string, value: number, min: number, max: number) => {
    if (value < min - tolerance || value > max + tolerance) {
      add(element, 'padding-range', `${label} ${value.toFixed(1)}px; expected ${min}–${max}px`);
    }
  };
  const elements = Array.from(root.querySelectorAll<HTMLElement>(boundaries)).filter(visible);
  for (const element of elements) {
    const style = getComputedStyle(element);
    if (element.scrollWidth > element.clientWidth + tolerance) {
      add(
        element,
        'horizontal-overflow',
        `content ${element.scrollWidth}px exceeds container ${element.clientWidth}px by ${element.scrollWidth - element.clientWidth}px`,
      );
    }
    const isPage = element.matches('.app-content');
    const isCard = element.matches('[data-slot="card"]');
    const isPanel = element.matches(
      '.compact-panel, .article-row, [data-slot="dialog-content"]:not([data-variant="drawer"])',
    );
    if (isPage || isPanel) {
      const left = parseFloat(style.paddingLeft);
      const right = parseFloat(style.paddingRight);
      const max = isPage
        ? innerWidth <= 640
          ? 24
          : 32
        : element.matches('[data-slot="dialog-content"]')
          ? 40
          : 24;
      range(element, 'left padding', left, isPage ? 12 : 8, max);
      range(element, 'right padding', right, isPage ? 12 : 8, max);
      if (Math.abs(left - right) > tolerance)
        add(
          element,
          'padding-symmetry',
          `left ${left}px / right ${right}px; expected equal horizontal insets (±${tolerance}px)`,
        );
    }
    if (isPanel || isCard) {
      const min = element.matches('.article-row') ? 6 : 8;
      const max =
        element.dataset.spacing === 'empty-state'
          ? 48
          : element.matches('[data-slot="dialog-content"]')
            ? 40
            : 32;
      range(element, 'top padding', parseFloat(style.paddingTop), min, max);
      range(element, 'bottom padding', parseFloat(style.paddingBottom), min, max);
    }
    if (isPage) range(element, 'bottom padding', parseFloat(style.paddingBottom), 12, 32);
    if (
      element.matches('.view-heading, .reader-filters, .today-workspace, .settings-workspace') &&
      ['flex', 'grid'].includes(style.display)
    ) {
      for (const [axis, value] of [
        ['row', style.rowGap],
        ['column', style.columnGap],
      ]) {
        const gap = parseFloat(value) || 0;
        if (gap < 8 - tolerance || gap > 32 + tolerance)
          add(element, 'gap-range', `${axis} gap ${gap}px; expected 8–32px`);
      }
    }
    const sectionedReader = element.matches(
      '.reader-detail, [data-slot="dialog-content"][data-variant="drawer"]',
    );
    if (element.matches('[data-slot="card"]') || sectionedReader) {
      const card = element.getBoundingClientRect();
      const sections = Array.from(
        element.querySelectorAll<HTMLElement>(
          sectionedReader
            ? ':scope > div'
            : ':scope > [data-slot="card-header"], :scope > [data-slot="card-content"], :scope > [data-slot="card-footer"]',
        ),
      ).filter(visible);
      const insets = sections.map((section) => {
        const rect = section.getBoundingClientRect();
        const sectionStyle = getComputedStyle(section);
        const left =
          rect.left +
          parseFloat(sectionStyle.paddingLeft) -
          card.left -
          parseFloat(style.borderLeftWidth);
        const right =
          card.right -
          rect.right +
          parseFloat(sectionStyle.paddingRight) -
          parseFloat(style.borderRightWidth);
        range(
          section,
          'effective left inset (including parent padding)',
          left,
          12,
          sectionedReader ? 40 : 32,
        );
        range(
          section,
          'effective right inset (including parent padding)',
          right,
          12,
          sectionedReader ? 40 : 32,
        );
        return { section, left, right };
      });
      for (const inset of insets.slice(1)) {
        const first = insets[0];
        if (
          Math.abs(inset.left - first.left) > tolerance ||
          Math.abs(inset.right - first.right) > tolerance
        ) {
          add(
            inset.section,
            'section-alignment',
            `section insets ${inset.left.toFixed(1)}/${inset.right.toFixed(1)}px differ from first section ${first.left.toFixed(1)}/${first.right.toFixed(1)}px`,
          );
        }
      }
      if (!sections.length) {
        // Centered empty states have their own explicit contract, not a blanket exemption.
        const roomy = element.dataset.spacing === 'empty-state';
        range(
          element,
          'container left padding',
          parseFloat(style.paddingLeft),
          roomy ? 24 : 12,
          roomy ? 48 : 32,
        );
        range(
          element,
          'container right padding',
          parseFloat(style.paddingRight),
          roomy ? 24 : 12,
          roomy ? 48 : 32,
        );
      }
    }
    if (element.matches('.view-heading, .reader-filters')) {
      const children = Array.from(element.children).filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement &&
          visible(child) &&
          getComputedStyle(child).position !== 'absolute',
      );
      for (let i = 0; i < children.length; i++) {
        for (const sibling of children.slice(i + 1)) {
          const a = children[i].getBoundingClientRect();
          const b = sibling.getBoundingClientRect();
          const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (overlapX > tolerance && overlapY > tolerance)
            add(
              sibling,
              'overlap',
              `overlaps ${selectorFor(children[i])} by ${overlapX.toFixed(1)} × ${overlapY.toFixed(1)}px`,
            );
        }
      }
    }
  }
  return issues;
}
