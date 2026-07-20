import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  disconnectZoom,
  getTrackerSettings,
  getZoomAuthURL,
  openExternalUrl,
  type TrackerSettings,
} from '@features/calendar/api/calendarClient';
import { isCloudEnabled } from '@shared/model/features';
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
    if (!isCloudEnabled()) return;
    setLoading(true);
    setError(null);
    try {
      setSettings(await getTrackerSettings());
    } catch (err) {
      console.error('[zoom] load settings failed', err);
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
      } catch (err) {
        console.warn('[zoom] oauth poll settings failed', err);
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

  if (!isCloudEnabled()) return null;

  const connected = settings?.zoomConnected === true;
  const reauthNeeded = settings?.zoomReauthRequired === true;
  const controlsDisabled = loading || busy || oauthPending;

  const connect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const url = await getZoomAuthURL();
      setOauthPending(true);
      openExternalUrl(url);
    } catch (err) {
      console.error('[nordly.settings.zoom] connect failed', err);
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
    } catch (err) {
      console.error('[zoom] disconnect failed', err);
      setError(t('nordly.settings.zoom.error_disconnect'));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = loading
    ? t('nordly.settings.zoom.loading')
    : oauthPending
      ? t('nordly.settings.zoom.oauth_pending')
      : reauthNeeded
        ? t('nordly.settings.zoom.reauth')
        : connected
          ? t('nordly.settings.zoom.connected')
          : t('nordly.settings.zoom.not_connected');

  return (
    <>
      <SettingRow label={t('nordly.settings.zoom.account_label')} hint={t('nordly.settings.zoom.account_hint')}>
        <div className="nordly-settings-google-actions" aria-busy={controlsDisabled}>
          <span className="mono nordly-settings-google-status" data-loading={loading ? 'true' : undefined}>
            {loading ? <InlineSpinner /> : null}
            {statusLabel}
          </span>
          {connected && !reauthNeeded ? (
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
                t('nordly.settings.zoom.disconnect')
              )}
            </button>
          ) : (
            <button
              type="button"
              className="nordly-settings-vault-btn"
              disabled={controlsDisabled}
              onClick={() => void connect()}
            >
              {busy || oauthPending ? (
                <>
                  <InlineSpinner />
                  {t('nordly.settings.zoom.connecting')}
                </>
              ) : reauthNeeded ? (
                t('nordly.settings.zoom.reconnect')
              ) : (
                t('nordly.settings.zoom.connect')
              )}
            </button>
          )}
        </div>
      </SettingRow>

      {error && <p className="nordly-settings-google-error mono">{error}</p>}
    </>
  );
}
