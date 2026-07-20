import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  getAppleCalendarAuthStatus,
  getAppleCalendarRuntimeInfo,
  listAppleCalendars,
  requestAppleCalendarAccess,
  type AppleCalendarListEntry,
} from '@features/calendar/api/appleCalendarClient';
import { resetAppleCalendarFetchBlock } from '@features/calendar/lib/useAppleCalendarEvents';
import { isMacOsDesktop } from '@platform/macos';
import {
  APPLE_CALENDAR_POLL_MINUTES,
  patchSettings,
  readSettings,
  type AppleCalendarPollMinutes,
} from '@shared/model/settings';
import { SettingRow } from '../primitives/SettingRow';

function readInvokeError(err: unknown): string {
  if (typeof err === 'string') return err.trim();
  if (err instanceof Error) return err.message.trim();
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message.trim();
  }
  return '';
}

function InlineSpinner(): JSX.Element {
  return <span className="nordly-inline-spinner" aria-hidden />;
}

export function AppleCalendarSection(): JSX.Element | null {
  const t = useT();
  const [enabled, setEnabled] = useState(() => readSettings().appleCalendarEnabled);
  const [pollMinutes, setPollMinutes] = useState<AppleCalendarPollMinutes>(
    () => readSettings().appleCalendarPollMinutes,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(() => readSettings().appleCalendarIds);
  const [calendars, setCalendars] = useState<AppleCalendarListEntry[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [status, setStatus] = useState('loading');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAppBundle, setNeedsAppBundle] = useState(false);

  const loadCalendars = useCallback(async (isAuthorized: boolean) => {
    if (!isAuthorized) {
      setCalendars([]);
      return;
    }
    try {
      setCalendars(await listAppleCalendars());
    } catch (err) {
      console.error('[appleCalendar] list calendars failed', err);
      setCalendars([]);
      setError(t('nordly.settings.apple.error_load'));
    }
  }, [t]);

  const applyConnected = useCallback(
    async (auth: { authorized: boolean; status: string }) => {
      if (!auth.authorized) return false;
      setAuthorized(true);
      setStatus(auth.status);
      setError(null);
      patchSettings({ appleCalendarEnabled: true });
      setEnabled(true);
      resetAppleCalendarFetchBlock();
      await loadCalendars(true);
      return true;
    },
    [loadCalendars],
  );

  const load = useCallback(async () => {
    if (!isMacOsDesktop()) return;
    setLoading(true);
    try {
      const [runtime, auth] = await Promise.all([
        getAppleCalendarRuntimeInfo(),
        getAppleCalendarAuthStatus(),
      ]);
      setNeedsAppBundle(!runtime.appBundle);
      setAuthorized(auth.authorized);
      setStatus(auth.status);
      if (auth.authorized) {
        setError(null);
        patchSettings({ appleCalendarEnabled: true });
        setEnabled(true);
        resetAppleCalendarFetchBlock();
      }
      await loadCalendars(auth.authorized);
    } catch (err) {
      console.error('[appleCalendar] load failed', err);
      setError(t('nordly.settings.apple.error_load'));
    } finally {
      setLoading(false);
    }
  }, [loadCalendars, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = (): void => {
      if (document.visibilityState === 'hidden') return;
      void load();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [load]);

  if (!isMacOsDesktop()) return null;

  const controlsDisabled = loading || busy;

  const statusLabel = loading
    ? t('nordly.settings.apple.loading')
    : authorized
      ? t('nordly.settings.apple.connected')
      : status === 'denied' || status === 'restricted' || status === 'write_only'
        ? t('nordly.settings.apple.denied')
        : t('nordly.settings.apple.not_connected');

  const connect = async () => {
    if (needsAppBundle) {
      setError(t('nordly.settings.apple.needs_app_bundle'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const current = await getAppleCalendarAuthStatus();
      if (await applyConnected(current)) {
        return;
      }

      const result = await requestAppleCalendarAccess();
      if (await applyConnected(result)) {
        return;
      }

      setAuthorized(false);
      setStatus(result.status);
      setError(
        result.settingsOpened
          ? t('nordly.settings.apple.settings_opened_hint')
          : t('nordly.settings.apple.error_access'),
      );
    } catch (err) {
      console.error('[appleCalendar] request access failed', err);
      setError(readInvokeError(err) || t('nordly.settings.apple.error_access'));
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = (next: boolean) => {
    setEnabled(next);
    patchSettings({ appleCalendarEnabled: next });
  };

  const toggleCalendar = (id: string) => {
    const allIds = calendars.map((cal) => cal.id);
    const base = selectedIds.length === 0 ? allIds : selectedIds;
    const has = base.includes(id);
    const nextSelected = has ? base.filter((item) => item !== id) : [...base, id];
    const normalized =
      nextSelected.length === 0 || nextSelected.length === allIds.length ? [] : nextSelected;
    setSelectedIds(normalized);
    patchSettings({ appleCalendarIds: normalized });
  };

  const selectAllCalendars = () => {
    setSelectedIds([]);
    patchSettings({ appleCalendarIds: [] });
  };

  const selectedCount =
    selectedIds.length === 0 ? calendars.length : selectedIds.length;
  const manyCalendars = calendars.length > 6;

  return (
    <>
      <SettingRow
        label={t('nordly.settings.apple.enable_label')}
        hint={t('nordly.settings.apple.enable_hint')}
      >
        <button
          type="button"
          className="nordly-settings-vault-btn"
          disabled={controlsDisabled || !authorized}
          aria-pressed={enabled}
          onClick={() => toggleEnabled(!enabled)}
        >
          {enabled ? t('nordly.settings.apple.on') : t('nordly.settings.apple.off')}
        </button>
      </SettingRow>

      <SettingRow
        label={t('nordly.settings.apple.poll_label')}
        hint={t('nordly.settings.apple.poll_hint')}
      >
        <span className="nordly-select-wrap">
          <select
            className="nordly-settings-select focus-ring"
            value={pollMinutes}
            disabled={controlsDisabled}
            onChange={(e) => {
              const next = Number(e.target.value) as AppleCalendarPollMinutes;
              setPollMinutes(next);
              patchSettings({ appleCalendarPollMinutes: next });
            }}
          >
            {APPLE_CALENDAR_POLL_MINUTES.map((m) => (
              <option key={m} value={m}>
                {t('nordly.settings.apple.poll_option', { minutes: m })}
              </option>
            ))}
          </select>
        </span>
      </SettingRow>

      <SettingRow
        label={t('nordly.settings.apple.access_label')}
        hint={t('nordly.settings.apple.access_hint')}
      >
        <div className="nordly-settings-google-actions" aria-busy={controlsDisabled}>
          <span className="mono nordly-settings-google-status" data-loading={loading ? 'true' : undefined}>
            {loading ? <InlineSpinner /> : null}
            {statusLabel}
          </span>
          {!authorized && (
            <button
              type="button"
              className="nordly-settings-vault-btn"
              disabled={controlsDisabled}
              onClick={() => void connect()}
            >
              {busy ? (
                <>
                  <InlineSpinner />
                  {t('nordly.settings.apple.requesting')}
                </>
              ) : (
                t('nordly.settings.apple.connect')
              )}
            </button>
          )}
        </div>
      </SettingRow>

      {authorized && calendars.length > 0 && (
        <SettingRow
          stacked
          label={t('nordly.settings.apple.calendars_label')}
          hint={t('nordly.settings.apple.calendars_hint')}
        >
          {manyCalendars ? (
            <div className="nordly-settings-apple-calendars__meta">
              <span className="mono nordly-settings-apple-calendars__count">
                {t('nordly.settings.apple.calendars_count', {
                  selected: selectedCount,
                  total: calendars.length,
                })}
              </span>
              {selectedCount < calendars.length ? (
                <button
                  type="button"
                  className="nordly-settings-apple-calendars__link focus-ring"
                  disabled={controlsDisabled}
                  onClick={selectAllCalendars}
                >
                  {t('nordly.settings.apple.calendars_all')}
                </button>
              ) : null}
            </div>
          ) : null}
          <div
            className="nordly-settings-apple-calendars"
            data-scrollable={manyCalendars ? 'true' : undefined}
          >
            {calendars.map((cal) => {
              const checked =
                selectedIds.length === 0 || selectedIds.includes(cal.id);
              return (
                <button
                  key={cal.id}
                  type="button"
                  className="nordly-shortcuts-list__preset focus-ring"
                  data-active={checked ? 'true' : 'false'}
                  disabled={controlsDisabled}
                  aria-pressed={checked}
                  onClick={() => toggleCalendar(cal.id)}
                >
                  {cal.title}
                </button>
              );
            })}
          </div>
        </SettingRow>
      )}

      {needsAppBundle ? (
        <p className="nordly-settings-google-error mono">{t('nordly.settings.apple.needs_app_bundle')}</p>
      ) : null}

      {error && !needsAppBundle ? <p className="nordly-settings-google-error mono">{error}</p> : null}
    </>
  );
}
