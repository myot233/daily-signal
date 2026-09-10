import { atom } from 'jotai';
import type { Settings } from '../../shared/types';
import type { GenerationProgress } from '../../shared/progress';

export type ModelDraft = Pick<Settings, 'baseUrl' | 'model' | 'deepseekThinking'>;
// Deliberately in-memory only: no atomWithStorage, persister, or devtools.
export const apiKeyAtom = atom('');
export const modelDraftAtom = atom<ModelDraft | null>(null);
export const templateDraftAtom = atom<string | null>(null);
export interface GenerationRun {
  date: string;
  status: 'running' | 'complete' | 'failed';
  startedAt: number;
  finishedAt?: number;
  events: GenerationProgress[];
  current?: string;
  error?: string;
}
export const generationAtom = atom<GenerationRun | null>(null);
