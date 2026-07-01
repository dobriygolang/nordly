import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  disconnectGoogleCalendar,
  getGoogleCalendarAuthURL,
  getTrackerSettings,
  listGoogleCalendars,
  openExternalUrl,
  updateTrackerSettings,
  type GoogleCalendarListEntry,
  type TrackerSettings,
} from '@features/calendar/api/calendarClient';
import { LOCAL_ONLY } from '@app/config/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { SettingRow } from '../primitives/SettingRow';
import { Toggle } from '../primitives/Toggle';

function InlineSpinner(): JSX.Element {
  return <span className="nordly-inline-spinner" aria-hidden />;
}

export function GoogleCalendarSection(): JSX.Element | null {
  const t = useT();
  const [settings, setSettings] = useState<TrackerSettings | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCalendars = useCallback(async (s: TrackerSettings | null) => {
    if (!s?.googleCalendarConnected || s.googleReauthRequired) {
      setCalendars([]);
      return;
    }
    try {
      setCalendars(await listGoogleCalendars());
    } catch {
      setCalendars([]);
    }
  }, []);

  const load = useCallback(async () => {
    if (LOCAL_ONLY) return;
    setLoading(true);
    setError(null);
    try {
      const s = await getTrackerSettings();
      setSettings(s);
      void loadCalendars(s);
    } catch {
      setError(t('nordly.settings.google.error_load'));
    } finally {
      setLoading(false);
    }
  }, [t, loadCalendars]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOAuth = (e: Event): void => {
      const detail = (e as CustomEvent<{ status?: string; detail?: string | null }>).detail;
      if (!detail?.status) return;
      if (detail.status === 'connected') {
        void load();
        return;
      }
      setError(
        detail.detail
          ? t('nordly.settings.google.error_detail', { detail: detail.detail })
          : t('nordly.settings.google.error_oauth'),
      );
    };
    window.addEventListener(NORDLY_EVENTS.googleCalendarOAuth, onOAuth);
    return () => window.removeEventListener(NORDLY_EVENTS.googleCalendarOAuth, onOAuth);
  }, [load, t]);

  if (LOCAL_ONLY) return null;

  const connected = settings?.googleCalendarConnected ?? false;
  const reauthNeeded = settings?.googleReauthRequired ?? false;
  const syncEnabled = settings?.googleCalendarSyncEnabled ?? false;
  const calendarId = settings?.googleCalendarId ?? 'primary';
  const controlsDisabled = loading || busy;

  const setCalendar = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      setSettings(await updateTrackerSettings({ googleCalendarId: id }));
    } catch {
      setError(t('nordly.settings.google.error_save'));
    } finally {
      setBusy(false);
    }
  };

  const setSync = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setSettings(await updateTrackerSettings({ googleCalendarSyncEnabled: enabled }));
    } catch {
      setError(t('nordly.settings.google.error_save'));
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = await getGoogleCalendarAuthURL();
      openExternalUrl(url);
    } catch {
      setError(t('nordly.settings.google.error_connect'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      setSettings(await disconnectGoogleCalendar());
    } catch {
      setError(t('nordly.settings.google.error_disconnect'));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = loading
    ? t('nordly.settings.google.loading')
    : reauthNeeded
      ? t('nordly.settings.google.reauth')
      : connected
        ? t('nordly.settings.google.connected')
        : t('nordly.settings.google.not_connected');

  return (
    <>
      <SettingRow label={t('nordly.settings.google.sync_label')} hint={t('nordly.settings.google.sync_hint')}>
        <Toggle
          value={syncEnabled}
          onChange={(v) => void setSync(v)}
          label={syncEnabled ? t('nordly.settings.google.sync_on') : t('nordly.settings.google.sync_off')}
          disabled={controlsDisabled}
        />
      </SettingRow>

      <SettingRow label={t('nordly.settings.google.account_label')} hint={t('nordly.settings.google.account_hint')}>
        <div className="nordly-settings-google-actions" aria-busy={controlsDisabled}>
          <span className="mono nordly-settings-google-status" data-loading={loading ? 'true' : undefined}>
            {loading ? <InlineSpinner /> : null}
            {statusLabel}
          </span>
          {connected ? (
            <button
              type="button"
              className="nordly-settings-vault-btn"
              disabled={controlsDisabled}
              onClick={() => void disconnect()}
            >
              {busy ? (
                <>
                  <InlineSpinner />
                  {t('nordly.vault.cta.working')}
                </>
              ) : (
                t('nordly.settings.google.disconnect')
              )}
            </button>
          ) : (
            <button
              type="button"
              className="nordly-settings-vault-btn"
              disabled={controlsDisabled}
              onClick={() => void connect()}
            >
              {busy ? (
                <>
                  <InlineSpinner />
                  {t('nordly.settings.google.connecting')}
                </>
              ) : (
                t('nordly.settings.google.connect')
              )}
            </button>
          )}
          <button
            type="button"
            className="nordly-settings-vault-btn"
            disabled={controlsDisabled}
            onClick={() => void load()}
          >
            {loading ? (
              <>
                <InlineSpinner />
                {t('nordly.settings.google.loading')}
              </>
            ) : (
              t('nordly.settings.google.refresh')
            )}
          </button>
        </div>
      </SettingRow>

      {connected && !reauthNeeded && calendars.length > 0 && (
        <SettingRow
          label={t('nordly.settings.google.calendar_label')}
          hint={t('nordly.settings.google.calendar_hint')}
        >
          <select
            className="nordly-settings-select focus-ring"
            value={calendarId}
            disabled={controlsDisabled}
            onChange={(e) => void setCalendar(e.target.value)}
          >
            {calendars.map((cal) => (
              <option key={cal.id} value={cal.id} disabled={!cal.writable}>
                {cal.summary || cal.id}
                {cal.primary ? ' ★' : ''}
                {cal.writable ? '' : ' (read-only)'}
              </option>
            ))}
          </select>
        </SettingRow>
      )}

      {error && <p className="nordly-settings-google-error mono">{error}</p>}
    </>
  );
}
