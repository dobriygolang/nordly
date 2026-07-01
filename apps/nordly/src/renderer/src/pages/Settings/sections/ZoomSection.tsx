import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  disconnectZoom,
  getTrackerSettings,
  getZoomAuthURL,
  openExternalUrl,
  type TrackerSettings,
} from '@features/calendar/api/calendarClient';
import { LOCAL_ONLY } from '@app/config/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { SettingRow } from '../primitives/SettingRow';

const OAUTH_POLL_MS = 2_000;
const OAUTH_POLL_MAX_MS = 3 * 60_000;

function InlineSpinner(): JSX.Element {
  return <span className="nordly-inline-spinner" aria-hidden />;
}

export function ZoomSection(): JSX.Element | null {
  const t = useT();
  const [settings, setSettings] = useState<TrackerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState(false);

  const load = useCallback(async () => {
    if (LOCAL_ONLY) return;
    setLoading(true);
    setError(null);
    try {
      setSettings(await getTrackerSettings());
    } catch {
      setError(t('nordly.settings.zoom.error_load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOAuth = (e: Event): void => {
      const detail = (e as CustomEvent<{ status?: string; detail?: string | null }>).detail;
      if (!detail?.status) return;
      setOauthPending(false);
      if (detail.status === 'connected') {
        void load();
        return;
      }
      setError(
        detail.detail
          ? t('nordly.settings.zoom.error_detail', { detail: detail.detail })
          : t('nordly.settings.zoom.error_oauth'),
      );
    };
    window.addEventListener(NORDLY_EVENTS.zoomOAuth, onOAuth);
    return () => window.removeEventListener(NORDLY_EVENTS.zoomOAuth, onOAuth);
  }, [load, t]);

  useEffect(() => {
    if (!oauthPending) return;

    let cancelled = false;
    const started = Date.now();

    const poll = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const s = await getTrackerSettings();
        if (s.zoomConnected && !s.zoomReauthRequired) {
          setSettings(s);
          setOauthPending(false);
          setError(null);
          return;
        }
      } catch {
        /* keep polling */
      }
      if (Date.now() - started >= OAUTH_POLL_MAX_MS) {
        setOauthPending(false);
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), OAUTH_POLL_MS);
    const onFocus = (): void => {
      void poll();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [oauthPending]);

  if (LOCAL_ONLY) return null;

  const connected = settings?.zoomConnected ?? false;
  const reauthNeeded = settings?.zoomReauthRequired ?? false;
  const controlsDisabled = loading || busy || oauthPending;

  const connect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const url = await getZoomAuthURL();
      setOauthPending(true);
      openExternalUrl(url);
    } catch {
      setError(t('nordly.settings.zoom.error_connect'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setSettings(await disconnectZoom());
    } catch {
      setError(t('nordly.settings.zoom.error_disconnect'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingRow
      label={t('nordly.settings.zoom.account_label')}
      hint={t('nordly.settings.zoom.account_hint')}
    >
      <div className="nordly-settings-actions">
        {loading ? (
          <span className="nordly-settings-muted">{t('nordly.settings.zoom.loading')}</span>
        ) : (
          <>
            <span className="nordly-settings-muted">
              {connected && !reauthNeeded
                ? t('nordly.settings.zoom.connected')
                : t('nordly.settings.zoom.not_connected')}
            </span>
            {reauthNeeded && (
              <p className="nordly-settings-warning">{t('nordly.settings.zoom.reauth')}</p>
            )}
            {oauthPending && (
              <p className="nordly-settings-muted">
                <InlineSpinner /> {t('nordly.settings.zoom.oauth_pending')}
              </p>
            )}
            {error && <p className="nordly-settings-error">{error}</p>}
            {connected && !reauthNeeded ? (
              <button
                type="button"
                className="nordly-pill-btn"
                disabled={controlsDisabled}
                onClick={() => void disconnect()}
              >
                {busy ? <InlineSpinner /> : t('nordly.settings.zoom.disconnect')}
              </button>
            ) : (
              <button
                type="button"
                className="nordly-pill-btn nordly-pill-btn--primary"
                disabled={controlsDisabled}
                onClick={() => void connect()}
              >
                {busy || oauthPending ? (
                  <>
                    <InlineSpinner /> {t('nordly.settings.zoom.connecting')}
                  </>
                ) : reauthNeeded ? (
                  t('nordly.settings.zoom.reconnect')
                ) : (
                  t('nordly.settings.zoom.connect')
                )}
              </button>
            )}
          </>
        )}
      </div>
    </SettingRow>
  );
}
