import { atom } from 'jotai';
import type { Settings } from '../../shared/types';

export type ModelDraft = Pick<Settings, 'baseUrl' | 'model' | 'deepseekThinking'>;
// Deliberately in-memory only: no atomWithStorage, persister, or devtools.
export const apiKeyAtom = atom('');
export const modelDraftAtom = atom<ModelDraft | null>(null);
export const templateDraftAtom = atom<string | null>(null);
