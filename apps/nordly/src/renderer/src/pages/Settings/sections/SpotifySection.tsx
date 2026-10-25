import { useEffect, useState } from 'react';

import { useT, type TFunc } from '@nordly-i18n';

import {
  connectSpotify,
  setSpotifyEnabled,
  disconnectSpotify,
  requestSpotifyLocalAccess,
  watchSpotifyPlayback,
  useSpotifyStore,
  type SpotifyConnectError,
} from '@features/spotify/api/spotifyClient';
import { isSpotifyConfigured } from '@features/spotify/lib/pkce';
import { isMacOsDesktop } from '@platform/macos';

import { Toggle } from '../primitives/Toggle';
import { SettingRow } from '../primitives/SettingRow';
import { InlineOAuthSpinner } from '../useIntegrationOAuth';

function connectErrorText(t: TFunc, error: SpotifyConnectError): string {
  if (error.kind === 'rate_limit') return t('nordly.settings.spotify.error_rate_limit', { time: new Date(error.retryAt).toLocaleTimeString() });
  if (error.kind === 'denied') return t('nordly.settings.spotify.error_oauth');
  if (error.kind === 'timeout') return t('nordly.settings.spotify.error_oauth_timeout');
  if (error.kind === 'desktop') return t('nordly.settings.spotify.error_desktop');
  if (error.kind === 'state' || error.kind === 'invalid') return t('nordly.settings.spotify.error_state');
  return t('nordly.settings.spotify.error_detail', { detail: error.detail });
}

export function SpotifySection(): JSX.Element {
  const t = useT();
  const enabled = useSpotifyStore((s) => s.enabled);
  const localStatus = useSpotifyStore((s) => s.localStatus);
  const nativeError = useSpotifyStore((s) => s.localError);
  const connected = useSpotifyStore((s) => s.libraryConnected);
  const reauthRequired = useSpotifyStore((s) => s.reauthRequired);
  const oauthPending = useSpotifyStore((s) => s.oauthPending);
  const connectError = useSpotifyStore((s) => s.connectError);
  const now = useSpotifyStore((s) => s.nowPlaying);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    return watchSpotifyPlayback();
  }, [enabled]);

  const playback = now.playback;
  const configured = isSpotifyConfigured();
  const controlsDisabled = busy || oauthPending;
  const connectDisabled = !enabled || !configured || controlsDisabled;
  const statusLabel = reauthRequired
    ? t('nordly.settings.spotify.reauth')
    : connected ? t('nordly.settings.spotify.connected') : t('nordly.settings.spotify.not_connected');
  const localLabel = !enabled ? t('nordly.settings.spotify.paused')
    : localStatus === null ? t('nordly.settings.spotify.loading')
    : t(`nordly.settings.spotify.local_${localStatus}`);
  const error = localError ?? (connectError ? connectErrorText(t, connectError) : null);

  const connect = async (): Promise<void> => {
    setBusy(true);
    setLocalError(null);
    try {
      await connectSpotify();
    } catch (err) {
      console.error('[nordly.settings.spotify] connect failed', err);
      if (!useSpotifyStore.getState().connectError) {
        setLocalError(t('nordly.settings.spotify.error_connect'));
      }
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    setBusy(true);
    setLocalError(null);
    try {
      await disconnectSpotify();
    } catch (err) {
      console.error('[nordly.settings.spotify] disconnect failed', err);
      setLocalError(t('nordly.settings.spotify.error_disconnect'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingRow label={t('nordly.settings.spotify.enabled')} hint={t('nordly.settings.spotify.enabled_hint')}>
        <Toggle value={enabled} onChange={setSpotifyEnabled} label={t(enabled ? 'nordly.settings.vault.on' : 'nordly.settings.vault.off')} />
      </SettingRow>
      <SettingRow label={t('nordly.settings.spotify.local_label')} hint={t('nordly.settings.spotify.local_hint')}>
        <div className="nordly-settings-google-actions" aria-busy={checking}>
          <span className="mono nordly-settings-google-status" role="status">{localLabel}</span>
          <button type="button" className="nordly-settings-vault-btn" disabled={!enabled || checking}
            onClick={() => {
              setChecking(true);
              void requestSpotifyLocalAccess().finally(() => setChecking(false));
            }}>
            {checking ? t('nordly.settings.spotify.loading') : t(localStatus === 'permission_required' ? 'nordly.settings.spotify.local_allow' : 'nordly.settings.spotify.local_check')}
          </button>
        </div>
      </SettingRow>
      {enabled && nativeError ? <p className="nordly-settings-google-error" role="alert">{nativeError}</p> : null}
      {enabled && localStatus === 'permission_denied' ? <p className="mono">{t('nordly.settings.spotify.local_permission_help')}</p> : null}
      {configured && isMacOsDesktop() ? <SettingRow
        label={t('nordly.settings.spotify.account_label')}
        hint={t('nordly.settings.spotify.account_hint')}
      >
        <div className="nordly-settings-google-actions" aria-busy={controlsDisabled}>
          <span className="mono nordly-settings-google-status">
            {oauthPending ? null : statusLabel}
          </span>
          {connected && !reauthRequired ? (
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
                t('nordly.settings.spotify.disconnect')
              )}
            </button>
          ) : (
            <button
              type="button"
              className="nordly-settings-vault-btn"
              disabled={connectDisabled}
              onClick={() => void connect()}
            >
              {busy || oauthPending ? (
                <>
                  <InlineOAuthSpinner />
                  {t('nordly.settings.spotify.connecting')}
                </>
              ) : reauthRequired ? (
                t('nordly.settings.spotify.reconnect')
              ) : (
                t('nordly.settings.spotify.connect')
              )}
            </button>
          )}
        </div>
      </SettingRow> : null}
      {enabled && now.likeError ? <p className="nordly-settings-google-error" role="alert">{now.likeError}</p> : null}
      {enabled && playback.kind === 'error' ? <p className="nordly-settings-google-error" role="alert">{playback.message}</p> : null}
      {enabled && oauthPending && !error ? (
        <p className="nordly-settings-google-error mono">{t('nordly.settings.spotify.oauth_pending')}</p>
      ) : null}
      {enabled && error ? <p className="nordly-settings-google-error mono">{error}</p> : null}
    </>
  );
}
