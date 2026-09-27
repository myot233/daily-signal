// Shared compact application styles. Reading content keeps its own typography.
export const ui = {
  emptyState: 'empty-state',
  eyebrow: 'text-xs text-muted-foreground',
  viewHeading: 'view-heading',
  field:
    'field flex flex-col gap-1.5 min-w-0 [&_[data-slot=label]]:text-xs [&_input]:bg-paper [&_textarea]:bg-paper',
  cardHeading:
    'card-heading flex items-center gap-3 [&_h2]:text-sm [&_h2]:font-semibold [&_p]:text-xs [&_p]:text-muted-foreground',
  onboardingStep: 'flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
} as const;
