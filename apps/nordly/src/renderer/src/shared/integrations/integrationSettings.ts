import { STORAGE_KEYS } from '@shared/lib/storage-keys';
import { clearOAuthTokens, loadOAuthTokens } from '@shared/integrations/oauthTokens';
import type { TrackerSettings } from '@features/calendar/model/calendar';

export type IntegrationProvider = 'google' | 'zoom';

const PREFS_KEY = STORAGE_KEYS.integrationPrefs;

export interface IntegrationPrefs {
  googleCalendarId: string;
}

const DEFAULT_PREFS: IntegrationPrefs = {
  googleCalendarId: 'primary',
};

export function readIntegrationPrefs(): IntegrationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<IntegrationPrefs>;
    const id =
      typeof parsed.googleCalendarId === 'string' && parsed.googleCalendarId.trim()
        ? parsed.googleCalendarId.trim()
        : DEFAULT_PREFS.googleCalendarId;
    return { googleCalendarId: id };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeIntegrationPrefs(patch: Partial<IntegrationPrefs>): IntegrationPrefs {
  const next = { ...readIntegrationPrefs(), ...patch };
  if (patch.googleCalendarId !== undefined) {
    const id = patch.googleCalendarId.trim();
    if (!id) throw new Error('googleCalendarId required');
    next.googleCalendarId = id;
  }
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

export async function readLocalTrackerSettings(): Promise<TrackerSettings> {
  const [google, zoom] = await Promise.all([loadOAuthTokens('google'), loadOAuthTokens('zoom')]);
  const prefs = readIntegrationPrefs();
  return {
    googleCalendarConnected: Boolean(google?.refreshToken),
    googleReauthRequired: google?.reauthRequired === true,
    googleCalendarId: prefs.googleCalendarId,
    zoomConnected: Boolean(zoom?.refreshToken),
    zoomReauthRequired: zoom?.reauthRequired === true,
  };
}

export async function clearLocalIntegration(provider: IntegrationProvider): Promise<TrackerSettings> {
  await clearOAuthTokens(provider);
  return readLocalTrackerSettings();
}
