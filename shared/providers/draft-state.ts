export function shouldDiscardProviderDraft(input: {
  draftProviderId: string | null;
  selectedProviderId: string | null;
  previousLocationKey: string;
  currentLocationKey: string;
}): boolean {
  if (!input.draftProviderId) return false;
  return input.draftProviderId !== input.selectedProviderId
    || input.previousLocationKey !== input.currentLocationKey;
}
