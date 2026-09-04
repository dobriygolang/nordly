import { useT } from '@nordly-i18n';

import {
  disconnectZoom,
  getZoomAuthURL,
  openExternalUrl,
} from '@features/calendar/api/calendarClient';
import { ensureCloudAuth } from '@shared/api/authSession';
import { isCloudEnabled } from '@shared/model/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { SettingRow } from '../primitives/SettingRow';
import { InlineOAuthSpinner, useIntegrationOAuth } from '../useIntegrationOAuth';

export function ZoomSection(): JSX.Element | null {
  const t = useT();
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
    event: NORDLY_EVENTS.zoomOAuth,
    isConnected: (s) => s.zoomConnected === true && !s.zoomReauthRequired,
    errorKeys: {
      load: 'nordly.settings.zoom.error_load',
      oauth: 'nordly.settings.zoom.error_oauth',
      oauthTimeout: 'nordly.settings.zoom.error_oauth_timeout',
      oauthDetail: 'nordly.settings.zoom.error_detail',
    },
    logPrefix: 'zoom',
  });

  if (!isCloudEnabled()) return null;

  const connected = settings?.zoomConnected === true;
  const reauthNeeded = settings?.zoomReauthRequired === true;
  const controlsDisabled = loading || busy || oauthPending;

  const connect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (!(await ensureCloudAuth())) return;
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
            {loading ? <InlineOAuthSpinner /> : null}
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
                  <InlineOAuthSpinner />
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
                  <InlineOAuthSpinner />
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
