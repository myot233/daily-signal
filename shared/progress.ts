import { z } from 'zod';

export const generationProgressSchema = z.object({
  id: z.string(), at: z.string(),
  kind: z.enum(['stage', 'model', 'webfetch']),
  status: z.enum(['queued', 'running', 'success', 'error', 'info']),
  message: z.string(),
  url: z.string().optional(), title: z.string().optional(),
});
export type GenerationProgress = z.infer<typeof generationProgressSchema>;
export type ProgressUpdate = Omit<GenerationProgress, 'at'>;
export type ProgressObserver = (event: GenerationProgress) => void;

// Each operation owns an ID, so its queued/running/completed events update one row.
export function updateProgress(events: GenerationProgress[], event: GenerationProgress): GenerationProgress[] {
  const index = events.findIndex(item => item.id === event.id);
  if (index < 0) return [...events, event].slice(-500);
  return events.map((item, position) => position === index ? event : item);
}
