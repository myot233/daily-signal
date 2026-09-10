import { EventPublisher } from '@orpc/server';
import type { GenerationEvent } from '../shared/contract';
import type { DigestInput } from '../shared/types';
import { generateDigest } from './ai';
import { HttpError } from './errors';
import { PublicFetchError } from './network';
import { TemplateError } from '../shared/template';

export function createGenerationService(run: typeof generateDigest = generateDigest) {
  let generating = false;
  async function generate(input: DigestInput, options: Parameters<typeof generateDigest>[1] = {}) {
    if (generating) throw new HttpError(409, '日报正在生成，请等待完成。');
    generating = true;
    try { return await run(input, options); } finally { generating = false; }
  }

  async function* stream(input: DigestInput, requestSignal?: AbortSignal): AsyncGenerator<GenerationEvent> {
    const controller = new AbortController();
    const signal = requestSignal ? AbortSignal.any([requestSignal, controller.signal]) : controller.signal;
    const publisher = new EventPublisher<{ progress: GenerationEvent }>({ maxBufferedEvents: 512 });
    const events = publisher.subscribe('progress', { signal });
    // Subscribe before starting: validation and preparation can emit synchronously.
    const task = generate(input, {
      signal,
      onProgress: progress => publisher.publish('progress', { type: 'progress', progress }),
    }).then(
      digest => publisher.publish('progress', { type: 'complete', digest }),
      error => publisher.publish('progress', {
        type: 'failed',
        message: error instanceof HttpError || error instanceof PublicFetchError || error instanceof TemplateError
          ? error.message : '生成失败，请检查配置后重试。',
      }),
    );
    try {
      for await (const event of events) {
        yield event;
        if (event.type !== 'progress') return;
      }
    } finally {
      controller.abort();
      await events.return(undefined);
      await task;
    }
  }
  return { generate, stream };
}
