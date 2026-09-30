import { eq } from 'drizzle-orm';
import type { AutomationSettings, Settings, SettingsUpdate } from '@daily-signal/domain';
import { db } from '@daily-signal/database';
import { settings } from '@daily-signal/database/schema';
import { normalizePublicUrl } from '@daily-signal/network';
import { replaceLegacyDefaultConnection, resolveProviderSnapshot } from '@daily-signal/providers';
import { getSettings } from '@daily-signal/settings';
import { refreshDailyDigestSchedule } from '@daily-signal/ai/daily-digest-scheduler';
import { feedRefreshScheduler } from './feed-refresh-scheduler';

export function saveAutomationSettings(input: AutomationSettings): Settings {
  if (input.autoDigest.enabled) resolveProviderSnapshot();
  const value = { ...getSettings(), ...input };
  db.update(settings).set({ value }).where(eq(settings.id, 1)).run();
  refreshDailyDigestSchedule();
  feedRefreshScheduler.refresh();
  return getSettings();
}

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
  feedRefreshScheduler.refresh();
  return getSettings();
}
