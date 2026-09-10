import { atom } from 'jotai';
import type { Settings } from '../../shared/types';

export type ModelDraft = Pick<Settings, 'baseUrl' | 'model' | 'deepseekThinking'>;
// Unsaved credential draft only; the saved key stays on the server.
export const apiKeyAtom = atom('');
export const modelDraftAtom = atom<ModelDraft | null>(null);
export const templateDraftAtom = atom<string | null>(null);
