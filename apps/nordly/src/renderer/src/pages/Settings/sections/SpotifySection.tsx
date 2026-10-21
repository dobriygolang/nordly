import { useEffect, useState } from 'react';

import { useT, type TFunc } from '@nordly-i18n';

import {
  connectSpotify,
  disconnectSpotify,
  hydrateSpotify,
  useSpotifyStore,
  type SpotifyConnectError,
} from '@features/spotify/api/spotifyClient';
import { isSpotifyConfigured } from '@features/spotify/lib/pkce';

import { SettingRow } from '../primitives/SettingRow';
import { InlineOAuthSpinner } from '../useIntegrationOAuth';

function connectErrorText(t: TFunc, error: SpotifyConnectError): string {
  if (error.kind === 'denied') return t('nordly.settings.spotify.error_oauth');
  if (error.kind === 'timeout') return t('nordly.settings.spotify.error_oauth_timeout');
  if (error.kind === 'desktop') return t('nordly.settings.spotify.error_desktop');
  if (error.kind === 'state' || error.kind === 'invalid') return t('nordly.settings.spotify.error_state');
  return t('nordly.settings.spotify.error_detail', { detail: error.detail });
}

export function SpotifySection(): JSX.Element {
  const t = useT();
  const hydrated = useSpotifyStore((s) => s.hydrated);
  const connected = useSpotifyStore((s) => s.connected);
  const reauthRequired = useSpotifyStore((s) => s.reauthRequired);
  const displayName = useSpotifyStore((s) => s.displayName);
  const oauthPending = useSpotifyStore((s) => s.oauthPending);
  const connectError = useSpotifyStore((s) => s.connectError);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void hydrateSpotify();
  }, []);

  const configured = isSpotifyConfigured();
  const controlsDisabled = !hydrated || busy || oauthPending;
  const connectDisabled = !configured || controlsDisabled;
  const statusLabel = !configured
    ? t('nordly.settings.spotify.missing_client')
    : !hydrated
    ? t('nordly.settings.spotify.loading')
    : reauthRequired
      ? t('nordly.settings.spotify.reauth')
      : connected
        ? displayName
          ? t('nordly.settings.spotify.connected_as', { name: displayName })
          : t('nordly.settings.spotify.connected')
        : t('nordly.settings.spotify.not_connected');
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
      <SettingRow
        label={t('nordly.settings.spotify.account_label')}
        hint={t('nordly.settings.spotify.account_hint')}
      >
        <div className="nordly-settings-google-actions" aria-busy={controlsDisabled}>
          <span className="mono nordly-settings-google-status" data-loading={hydrated ? undefined : 'true'}>
            {hydrated ? null : <InlineOAuthSpinner />}
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
      </SettingRow>
      {oauthPending && !error ? (
        <p className="nordly-settings-google-error mono">{t('nordly.settings.spotify.oauth_pending')}</p>
      ) : null}
      {error ? <p className="nordly-settings-google-error mono">{error}</p> : null}
    </>
  );
}
