import { translate } from '@nordly-i18n';
import { listen } from '@tauri-apps/api/event';
import { isTauriRuntime } from '@platform/runtime';
import { listenEffects } from '@shared/lib/tauriListen';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { patchSettings, readSettings } from '@shared/model/settings';
import { SpotifyHttpError, exchangeAuthorizationCode, refreshAccessToken, spotifyAuthRetryAt, spotifyLibrarySend } from '../remote/spotifyRemote';
import { SPOTIFY_CMD_EVENT } from './nowPlaying';
import { createPkce, spotifyAuthorizeUrl, spotifyClientId } from './pkce';
import { mapTrackLiked } from './playback';
import { clearSpotifySecret, emptySecret, loadSpotifySecret, saveSpotifySecret, type SpotifySecret } from './secret';
import { patchSpotify, useSpotifyStore, type SpotifyConnectError } from './spotifyStore';
import { broadcastSpotifyNow, initLocalSpotifyLeader } from './localPlayer';

const OAUTH_TIMEOUT_MS = 3 * 60_000;
const TOKEN_SKEW_MS = 60_000;
let refreshPromise: Promise<string> | null = null;
let oauthGeneration = 0;
let libraryEpoch = 0;
let credentialEpoch = 0;
let likePending = false;
let leaderStarted = false;

async function openExternal(url: string): Promise<void> {
  const open = window.nordly?.shell?.openExternal;
  if (!open) throw new Error('Spotify connect requires the desktop app');
  await open(url);
}

function connectFailure(error: unknown): SpotifyConnectError {
  if (error instanceof SpotifyHttpError && error.status === 429) return { kind: 'rate_limit', retryAt: error.retryAt };
  if (error instanceof SpotifyHttpError) return { kind: 'exchange', detail: spotifyErrorText(error) };
  if (error instanceof Error && error.message) return { kind: 'exchange', detail: error.message };
  return { kind: 'exchange', detail: 'Spotify sign-in failed' };
}

async function readSecret(): Promise<SpotifySecret> {
  const secret = await loadSpotifySecret();
  if (!secret || (!secret.accessToken && !secret.refreshToken)) {
    throw new SpotifyHttpError(401, 'Spotify is not connected');
  }
  return secret;
}

function tokenStillValid(secret: SpotifySecret): boolean {
  return secret.accessToken.length > 0 && secret.expiresAt > Date.now() + TOKEN_SKEW_MS;
}

function singleFlight(run: () => Promise<string>): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = run().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function validAccessToken(): Promise<string> {
  const secret = await readSecret();
  if (tokenStillValid(secret)) return secret.accessToken;
  return singleFlight(async () => {
    const latest = await readSecret();
    if (tokenStillValid(latest)) return latest.accessToken;
    return forceRefresh(latest);
  });
}

async function forceRefresh(secret: SpotifySecret): Promise<string> {
  const epoch = credentialEpoch;
  const clientId = spotifyClientId();
  if (!clientId) throw new Error('Spotify client id is not configured');
  if (!secret.refreshToken) {
    patchSpotify({ reauthRequired: true });
    throw new SpotifyHttpError(401, 'Spotify access expired');
  }
  try {
    const tokens = await refreshAccessToken(clientId, secret.refreshToken);
    const next: SpotifySecret = {
      ...secret,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
    };
    if (epoch !== credentialEpoch) throw new Error('Spotify library operation was cancelled');
    await saveSpotifySecret(next);
    patchSpotify({ reauthRequired: false });
    return next.accessToken;
  } catch (error) {
    if (error instanceof SpotifyHttpError && (error.status === 400 || error.status === 401)) {
      patchSpotify({ reauthRequired: true });
    }
    throw error;
  }
}

async function withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
  if (!useSpotifyStore.getState().enabled) throw new Error('Spotify integration is disabled');
  const epoch = libraryEpoch;
  const token = await validAccessToken();
  if (epoch !== libraryEpoch || !useSpotifyStore.getState().enabled) throw new Error('Spotify operation was cancelled');
  try {
    return await fn(token);
  } catch (error) {
    if (!(error instanceof SpotifyHttpError) || error.status !== 401) throw error;
    const refreshed = await singleFlight(async () => forceRefresh(await readSecret()));
    if (epoch !== libraryEpoch || !useSpotifyStore.getState().enabled) throw new Error('Spotify operation was cancelled');
    if (refreshed === token) throw error;
    return fn(refreshed);
  }
}

export function spotifyErrorText(error: unknown): string {
  if (error instanceof SpotifyHttpError) {
    if (error.status === 429 && error.reason === 'QUOTA_EXCEEDED') return translate('nordly.spotify.error.quota');
    if (error.status === 429) return translate('nordly.spotify.error.rate_limit');
    if (error.status === 403) {
      if (/scope/i.test(error.message)) return translate('nordly.spotify.error.scope');
      return translate('nordly.spotify.error.access');
    }
  }
  return error instanceof Error ? error.message : 'Spotify playback failed';
}

export async function connectSpotify(): Promise<void> {
  if (!useSpotifyStore.getState().enabled) return;
  const clientId = spotifyClientId();
  if (!clientId) throw new Error('Spotify client id is not configured');
  if (!isTauriRuntime() || !window.nordly?.spotify) {
    patchSpotify({ connectError: { kind: 'desktop' } });
    throw new Error('Spotify connect requires the desktop app');
  }
  const saved = await loadSpotifySecret();
  if (saved && (saved.accessToken || saved.refreshToken) && !useSpotifyStore.getState().reauthRequired) {
    patchSpotify({ libraryConnected: true, connectError: null });
    patchSettings({ spotifyLikedSongs: true });
    await updateLibraryAvailability();
    return;
  }
  const retryAt = spotifyAuthRetryAt();
  if (Date.now() < retryAt) {
    const error = new SpotifyHttpError(429, 'Too many requests', retryAt);
    patchSpotify({ connectError: connectFailure(error) });
    throw error;
  }
  const generation = ++oauthGeneration;
  const pkce = await createPkce();
  const existing = (await loadSpotifySecret()) ?? emptySecret();
  await saveSpotifySecret({
    ...existing,
    codeVerifier: pkce.verifier,
    oauthState: pkce.state,
  });
  patchSpotify({ oauthPending: true, connectError: null });
  try {
    await openExternal(spotifyAuthorizeUrl(clientId, pkce.challenge, pkce.state));
  } catch (error) {
    patchSpotify({ oauthPending: false });
    throw error;
  }
  window.setTimeout(() => {
    if (generation !== oauthGeneration) return;
    if (!useSpotifyStore.getState().oauthPending) return;
    patchSpotify({ oauthPending: false, connectError: { kind: 'timeout' } });
  }, OAUTH_TIMEOUT_MS);
}

export async function disconnectSpotify(): Promise<void> {
  libraryEpoch += 1;
  credentialEpoch += 1;
  oauthGeneration += 1;
  if (isTauriRuntime() && window.nordly?.spotify) await clearSpotifySecret();
  patchSettings({ spotifyLikedSongs: false });
  patchSpotify({
    libraryConnected: false,
    reauthRequired: false,
    oauthPending: false,
    connectError: null,
  });
  await updateLibraryAvailability();
}

export async function acceptSpotifyRedirect(code: string, state: string): Promise<void> {
  if (!useSpotifyStore.getState().enabled) return;
  const epoch = credentialEpoch;
  oauthGeneration += 1;
  const clientId = spotifyClientId();
  if (!clientId) throw new Error('Spotify client id is not configured');
  const secret = await loadSpotifySecret();
  if (!secret || !secret.codeVerifier || secret.oauthState !== state) {
    patchSpotify({ oauthPending: false, connectError: { kind: 'state' } });
    throw new Error('Spotify sign-in state did not match');
  }
  try {
    const tokens = await exchangeAuthorizationCode(clientId, code, secret.codeVerifier);
    if (epoch !== credentialEpoch) return;
    await saveSpotifySecret({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
      codeVerifier: '',
      oauthState: '',
    });
    patchSpotify({
      libraryConnected: true,
      reauthRequired: false,
        oauthPending: false,
      connectError: null,
    });
    patchSettings({ spotifyLikedSongs: true });
    await updateLibraryAvailability();
  } catch (error) {
    console.error('[nordly:spotify] token exchange failed', error);
    patchSpotify({ oauthPending: false, connectError: connectFailure(error) });
    throw error;
  }
}

export function noteSpotifyRedirectError(error: string): void {
  oauthGeneration += 1;
  patchSpotify({
    oauthPending: false,
    connectError: error === 'access_denied' ? { kind: 'denied' } : { kind: 'invalid' },
  });
}


async function updateLibraryAvailability(): Promise<void> {
  const { nowPlaying, libraryConnected } = useSpotifyStore.getState();
  await broadcastSpotifyNow({ ...nowPlaying, canLike: libraryConnected, liked: false, likeError: '' });
}

/** The library is read only on a heart click, never by local playback polling. */
export async function toggleSpotifyLike(): Promise<void> {
  const { enabled, libraryConnected, nowPlaying: current } = useSpotifyStore.getState();
  if (!enabled || !libraryConnected || current.playback.kind !== 'track' || likePending) return;
  const trackId = current.playback.trackId;
  const epoch = libraryEpoch;
  const uri = encodeURIComponent(`spotify:track:${trackId}`);
  likePending = true;
  try {
    const liked = mapTrackLiked(await withToken((token) => spotifyLibrarySend(token, 'GET', `/me/library/contains?uris=${uri}`)));
    if (!useSpotifyStore.getState().enabled || epoch !== libraryEpoch) return;
    await withToken((token) => spotifyLibrarySend(token, liked ? 'DELETE' : 'PUT', `/me/library?uris=${uri}`));
    const latest = useSpotifyStore.getState().nowPlaying;
    if (!useSpotifyStore.getState().enabled || epoch !== libraryEpoch || latest.playback.kind !== 'track' || latest.playback.trackId !== trackId) return;
    await broadcastSpotifyNow({ ...latest, liked: !liked, likeError: '' });
  } catch (error) {
    if (epoch !== libraryEpoch || !useSpotifyStore.getState().enabled) return;
    const latest = useSpotifyStore.getState().nowPlaying;
    if (latest.playback.kind === 'track' && latest.playback.trackId === trackId) {
      await broadcastSpotifyNow({ ...latest, likeError: spotifyErrorText(error) });
    }
  } finally { likePending = false; }
}

export function initSpotifyLeader(): () => void {
  if (leaderStarted || !isTauriRuntime()) return () => undefined;
  leaderStarted = true;
  const stopLocal = initLocalSpotifyLeader();
  // Opt-in library support only loads credentials; playback never hydrates OAuth.
  const syncLibrary = () => {
    if (!useSpotifyStore.getState().enabled) {
      libraryEpoch += 1;
      oauthGeneration += 1;
      patchSpotify({ oauthPending: false });
      return;
    }
    if (readSettings().spotifyLikedSongs && !useSpotifyStore.getState().libraryConnected) {
      const epoch = libraryEpoch;
      void loadSpotifySecret().then(async (secret) => {
        if (epoch !== libraryEpoch || !useSpotifyStore.getState().enabled) return;
        patchSpotify({ libraryConnected: Boolean(secret && (secret.accessToken || secret.refreshToken)) });
        await updateLibraryAvailability();
      }).catch((error) => patchSpotify({ connectError: connectFailure(error) }));
    }
  };
  window.addEventListener(NORDLY_EVENTS.settingsChanged, syncLibrary);
  syncLibrary();
  const stopLibrary = listenEffects((track) => {
    track(listen<{ action?: string }>(SPOTIFY_CMD_EVENT, ({ payload }) => {
      if (payload?.action === 'like') void toggleSpotifyLike();
    }));
  });
  return () => { leaderStarted = false; libraryEpoch += 1; stopLocal(); stopLibrary(); window.removeEventListener(NORDLY_EVENTS.settingsChanged, syncLibrary); };
}
