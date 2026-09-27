import { eq } from 'drizzle-orm';
import type { Settings, SettingsUpdate } from '@daily-signal/domain';
import { db } from '@daily-signal/database';
import { settings } from '@daily-signal/database/schema';
import { normalizePublicUrl } from '@daily-signal/network';
import { replaceLegacyDefaultConnection } from '@daily-signal/providers';
import { getSettings } from '@daily-signal/settings';
import { refreshDailyDigestSchedule } from '@daily-signal/ai/daily-digest-scheduler';

export function saveSettings(input: SettingsUpdate): Settings {
  normalizePublicUrl(input.baseUrl);
  const { apiKey, ...value } = input;
  const current = getSettings();
  const connectionChanged =
    value.baseUrl !== current.baseUrl ||
    value.model !== current.model ||
    value.deepseekThinking !== current.deepseekThinking;
  if (connectionChanged || apiKey !== undefined) {
    replaceLegacyDefaultConnection(value, apiKey);
  }
  db.update(settings).set({ value }).where(eq(settings.id, 1)).run();
  refreshDailyDigestSchedule();
  return getSettings();
}
