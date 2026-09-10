import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { eq } from 'drizzle-orm';

process.env.DATABASE_PATH = ':memory:';
// Database modules are loaded after isolation because their imports open the configured SQLite file.
const { db } = await import('../../infrastructure/database/client');
const { digestGenerationSessions, digests, providerCredentials, providerModels, settings } =
  await import('../../infrastructure/database/schema');
const { initializeDailyDigestScheduler, stopDailyDigestScheduler } =
  await import('./daily-digest-scheduler');
const { getActiveDigestGenerationSessionId } = await import('./generation-repository');
const { initializeDigestGenerationQueue, stopDigestGenerationQueue, subscribeDigestGeneration } =
  await import('./generation-queue');
const { getSettings } = await import('../settings/repository');

initializeDigestGenerationQueue();

after(async () => {
  stopDailyDigestScheduler();
  await stopDigestGenerationQueue();
});

test('daily scheduler runs at the configured local time and skips an already archived date', async () => {
  assert.equal(getSettings().autoDigest.enabled, false);
  assert.equal(initializeDailyDigestScheduler(), null);

  const currentSettings = getSettings();
  db.update(settings)
    .set({ value: { ...currentSettings, autoDigest: { enabled: true, time: '20:15' } } })
    .where(eq(settings.id, 1))
    .run();

  const job = initializeDailyDigestScheduler();
  assert.ok(job);
  const nextRun = job.nextRun(new Date(2026, 8, 10, 19, 30));
  assert.equal(nextRun?.getFullYear(), 2026);
  assert.equal(nextRun?.getMonth(), 8);
  assert.equal(nextRun?.getDate(), 10);
  assert.equal(nextRun?.getHours(), 20);
  assert.equal(nextRun?.getMinutes(), 15);

  const defaultModelId = db
    .select({ id: settings.defaultProviderModelId })
    .from(settings)
    .where(eq(settings.id, 1))
    .get()?.id;
  assert.ok(defaultModelId);
  const providerId = db
    .select({ id: providerModels.providerId })
    .from(providerModels)
    .where(eq(providerModels.id, defaultModelId))
    .get()?.id;
  assert.ok(providerId);
  db.insert(providerCredentials)
    .values({ providerId, apiKey: 'SCHEDULED-TEST-KEY', updatedAt: new Date().toISOString() })
    .run();

  await job.trigger();
  const sessionId = getActiveDigestGenerationSessionId();
  assert.ok(sessionId);
  const events = [];
  for await (const event of subscribeDigestGeneration({ sessionId })) events.push(event);
  const terminal = events.at(-1);
  assert.equal(terminal?.type, 'failed');
  if (terminal?.type === 'failed') assert.match(terminal.message, /没有可总结的文章/);

  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  db.insert(digests)
    .values({
      id: 'already-archived',
      date,
      title: 'Existing digest',
      markdown: '# Existing digest',
      createdAt: now.toISOString(),
      articleCount: 0,
      model: 'test-model',
      sources: [],
      providerId: null,
      providerName: null,
      providerProtocol: null,
      providerModelId: null,
      providerOptions: null,
    })
    .run();
  const sessionCount = db
    .select({ id: digestGenerationSessions.id })
    .from(digestGenerationSessions)
    .all().length;
  await job.trigger();
  assert.equal(
    db.select({ id: digestGenerationSessions.id }).from(digestGenerationSessions).all().length,
    sessionCount,
  );
});
