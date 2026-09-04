import { useCallback, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  disconnectGoogleCalendar,
  getGoogleCalendarAuthURL,
  listGoogleCalendars,
  openExternalUrl,
  updateTrackerSettings,
  type GoogleCalendarListEntry,
  type TrackerSettings,
} from '@features/calendar/api/calendarClient';
import { ensureCloudAuth } from '@shared/api/authSession';
import { isCloudEnabled } from '@shared/model/features';
import {
  invalidateGoogleCalendarCache,
  markGoogleCalendarDisconnected,
} from '@features/calendar/api/googleCalendarState';
import {
  GOOGLE_CALENDAR_POLL_MINUTES,
  type GoogleCalendarPollMinutes,
} from '@shared/model/settings';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { SettingRow } from '../primitives/SettingRow';
import { InlineOAuthSpinner, useIntegrationOAuth } from '../useIntegrationOAuth';

export function GoogleCalendarSection({
  pollMinutes,
  onPollMinutesChange,
}: {
  pollMinutes: GoogleCalendarPollMinutes;
  onPollMinutesChange: (minutes: GoogleCalendarPollMinutes) => void;
}): JSX.Element | null {
  const t = useT();
  const [calendars, setCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);

  const loadCalendars = useCallback(async (s: TrackerSettings | null) => {
    if (!s?.googleCalendarConnected || s.googleReauthRequired) {
      setCalendars([]);
      setCalendarsError(null);
      return;
    }
    try {
      setCalendars(await listGoogleCalendars());
      setCalendarsError(null);
    } catch (err) {
      console.error('[googleCalendar] list calendars failed', err);
      setCalendars([]);
      setCalendarsError(err instanceof Error ? err.message : t('nordly.settings.google.error_load'));
    }
  }, [t]);

  const {
    settings,
    setSettings,
    loading,
    busy,
    setBusy,
    error,
    setError,
    oauthPending,
    setOauthPending,
  } = useIntegrationOAuth({
    event: NORDLY_EVENTS.googleCalendarOAuth,
    isConnected: (s) => s.googleCalendarConnected === true && !s.googleReauthRequired,
    afterLoad: loadCalendars,
    errorKeys: {
      load: 'nordly.settings.google.error_load',
      oauth: 'nordly.settings.google.error_oauth',
      oauthTimeout: 'nordly.settings.google.error_oauth_timeout',
      oauthDetail: 'nordly.settings.google.error_detail',
    },
    logPrefix: 'googleCalendar',
  });

  if (!isCloudEnabled()) return null;

  const connected = settings?.googleCalendarConnected === true;
  const reauthNeeded = settings?.googleReauthRequired === true;
  const calendarId = settings?.googleCalendarId ?? '';
  const controlsDisabled = loading || busy || oauthPending || !settings;

  const setCalendar = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      setSettings(await updateTrackerSettings({ googleCalendarId: id }));
    } catch (err) {
      console.error('[googleCalendar] save calendar id failed', err);
      setError(t('nordly.settings.google.error_save'));
    } finally {
      setBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!(await ensureCloudAuth())) return;
      const url = await getGoogleCalendarAuthURL();
      openExternalUrl(url);
      setOauthPending(true);
    } catch (err) {
      console.error('[googleCalendar] connect failed', err);
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
      invalidateGoogleCalendarCache();
      markGoogleCalendarDisconnected();
      window.dispatchEvent(new Event(NORDLY_EVENTS.googleCalendarChanged));
    } catch (err) {
      console.error('[googleCalendar] disconnect failed', err);
      setError(t('nordly.settings.google.error_disconnect'));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = loading
    ? t('nordly.settings.google.loading')
    : oauthPending
      ? t('nordly.settings.google.oauth_pending')
      : reauthNeeded
      ? t('nordly.settings.google.reauth')
      : connected
        ? t('nordly.settings.google.connected')
        : t('nordly.settings.google.not_connected');

  return (
    <>
      <SettingRow
        label={t('nordly.settings.google.poll_label')}
        hint={t('nordly.settings.google.poll_hint')}
      >
        <span className="nordly-select-wrap">
          <select
            className="nordly-settings-select focus-ring"
            value={pollMinutes}
            disabled={controlsDisabled}
            onChange={(e) => onPollMinutesChange(Number(e.target.value) as GoogleCalendarPollMinutes)}
          >
            {GOOGLE_CALENDAR_POLL_MINUTES.map((m) => (
              <option key={m} value={m}>
                {t('nordly.settings.google.poll_option', { minutes: m })}
              </option>
            ))}
          </select>
        </span>
      </SettingRow>

      <SettingRow label={t('nordly.settings.google.account_label')} hint={t('nordly.settings.google.account_hint')}>
        <div className="nordly-settings-google-actions" aria-busy={controlsDisabled}>
          <span className="mono nordly-settings-google-status" data-loading={loading ? 'true' : undefined}>
            {loading ? <InlineOAuthSpinner /> : null}
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
                  <InlineOAuthSpinner />
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
                  <InlineOAuthSpinner />
                  {t('nordly.settings.google.connecting')}
                </>
              ) : (
                t('nordly.settings.google.connect')
              )}
            </button>
          )}
        </div>
      </SettingRow>

      {connected && !reauthNeeded && calendars.length > 0 && (
        <SettingRow
          label={t('nordly.settings.google.calendar_label')}
          hint={t('nordly.settings.google.calendar_hint')}
        >
          <span className="nordly-select-wrap">
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
          </span>
        </SettingRow>
      )}

      {(error || calendarsError) && (
        <p className="nordly-settings-google-error mono">{error ?? calendarsError}</p>
      )}
    </>
  );
}
