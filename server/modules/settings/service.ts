import { eq } from 'drizzle-orm';
import type { Settings, SettingsUpdate } from '../../../shared/types';
import { db } from '../../infrastructure/database/client';
import { settings } from '../../infrastructure/database/schema';
import { normalizePublicUrl } from '../../infrastructure/network/public-fetch';
import { replaceLegacyDefaultConnection } from '../providers/repository';
import { getSettings } from './repository';
import { refreshDailyDigestSchedule } from '../ai/daily-digest-scheduler';

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
