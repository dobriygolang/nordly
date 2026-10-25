import { translate } from '@nordly-i18n';
import { emit, listen } from '@tauri-apps/api/event';

import { isTauriRuntime } from '@platform/runtime';
import { listenEffects } from '@shared/lib/tauriListen';

import { SpotifyHttpError, exchangeAuthorizationCode, refreshAccessToken, spotifySend } from '../remote/spotifyRemote';
import {
  disconnectedNowPlaying,
  SPOTIFY_CMD_EVENT,
  SPOTIFY_NOW_EVENT,
  SPOTIFY_POLL_MS,
  type SpotifyNowPlaying,
} from './nowPlaying';
import {
  createPkce,
  isSpotifyConfigured,
  spotifyAuthorizeUrl,
  spotifyClientId,
} from './pkce';
import {
  mapCurrentlyPlaying,
  mapDeviceVolume,
  mapProfile,
  mapTrackLiked,
  type PlaybackItem,
} from './playback';
import { clearSpotifySecret, emptySecret, loadSpotifySecret, saveSpotifySecret, type SpotifySecret } from './secret';
import { patchSpotify, useSpotifyStore, type SpotifyConnectError } from './spotifyStore';

const OAUTH_TIMEOUT_MS = 3 * 60_000;
const VOLUME_DEBOUNCE_MS = 180;
const TOKEN_SKEW_MS = 60_000;

let hydratePromise: Promise<void> | null = null;
let refreshPromise: Promise<string> | null = null;
let oauthGeneration = 0;
let pollTimer: number | null = null;
let volumeTimer: number | null = null;
let volumeLocked = false;
let leaderStarted = false;

async function openExternal(url: string): Promise<void> {
  const open = window.nordly?.shell?.openExternal;
  if (!open) throw new Error('Spotify connect requires the desktop app');
  await open(url);
}

function connectFailure(error: unknown): SpotifyConnectError {
  if (error instanceof SpotifyHttpError) return { kind: 'exchange', detail: error.message };
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
  const token = await validAccessToken();
  try {
    return await fn(token);
  } catch (error) {
    if (!(error instanceof SpotifyHttpError) || error.status !== 401) throw error;
    const refreshed = await singleFlight(async () => forceRefresh(await readSecret()));
    if (refreshed === token) throw error;
    return fn(refreshed);
  }
}

async function broadcast(now: SpotifyNowPlaying): Promise<void> {
  patchSpotify({ nowPlaying: now });
  if (!isTauriRuntime()) return;
  await emit(SPOTIFY_NOW_EVENT, now);
}

async function readNowPlaying(): Promise<SpotifyNowPlaying> {
  const body = await withToken((token) =>
    spotifySend(token, 'GET', '/me/player/currently-playing?additional_types=track,episode'),
  );
  const playback = mapCurrentlyPlaying(body);
  if (playback.kind !== 'track') {
    return { connected: true, playback, liked: false, likeError: '' };
  }
  try {
    const likedBody = await withToken((token) =>
      spotifySend(token, 'GET', `/me/library/contains?uris=${encodeURIComponent(`spotify:track:${playback.trackId}`)}`),
    );
    return { connected: true, playback, liked: mapTrackLiked(likedBody), likeError: '' };
  } catch (error) {
    return { connected: true, playback, liked: false, likeError: spotifyErrorText(error) };
  }
}

export async function refreshSpotifyPlayback(): Promise<void> {
  if (!useSpotifyStore.getState().connected) {
    await broadcast(disconnectedNowPlaying());
    return;
  }
  try {
    await broadcast(await readNowPlaying());
  } catch (error) {
    const message = spotifyErrorText(error);
    console.error('[nordly:spotify] now playing failed', error);
    await broadcast({
      connected: true,
      playback: { kind: 'error', message },
      liked: false,
      likeError: '',
    });
  }
}

function startWatch(): void {
  if (pollTimer !== null) window.clearInterval(pollTimer);
  void refreshSpotifyPlayback();
  pollTimer = window.setInterval(() => {
    void refreshSpotifyPlayback();
  }, SPOTIFY_POLL_MS);
}

function stopWatch(): void {
  if (pollTimer !== null) window.clearInterval(pollTimer);
  pollTimer = null;
}

async function toggleLike(): Promise<void> {
  const current = useSpotifyStore.getState().nowPlaying;
  const playback: PlaybackItem | { kind: 'error'; message: string } = current.playback;
  if (!current.connected || playback.kind !== 'track' || current.likeError) return;
  const trackId = playback.trackId;
  try {
    await withToken((token) =>
      spotifySend(
        token,
        current.liked ? 'DELETE' : 'PUT',
        `/me/library?uris=${encodeURIComponent(`spotify:track:${trackId}`)}`,
      ),
    );
    const latest = useSpotifyStore.getState().nowPlaying;
    if (latest.playback.kind !== 'track' || latest.playback.trackId !== trackId) return;
    await broadcast({ ...latest, liked: !current.liked, likeError: '' });
  } catch (error) {
    const message = spotifyErrorText(error);
    console.error('[nordly:spotify] like failed', error);
    await broadcast({ ...current, likeError: message });
  }
}

export function spotifyErrorText(error: unknown): string {
  if (error instanceof SpotifyHttpError) {
    if (error.status === 404) return translate('nordly.spotify.error.device');
    if (error.status === 403) {
      if (/premium/i.test(error.message)) return translate('nordly.spotify.error.premium');
      if (/scope/i.test(error.message)) return translate('nordly.spotify.error.scope');
      return translate('nordly.spotify.error.access');
    }
  }
  return error instanceof Error ? error.message : 'Spotify playback failed';
}

let playbackBusy = false;
export async function toggleSpotifyPlayback(): Promise<void> {
  if (playbackBusy || !useSpotifyStore.getState().connected) return;
  playbackBusy = true;
  try {
    // Read the device state before deciding, since playback may change outside Nordly.
    const body = await withToken((token) => spotifySend(token, 'GET', '/me/player'));
    if (body !== null && (typeof body !== 'object' || !('is_playing' in body) || typeof body.is_playing !== 'boolean')) {
      throw new Error('Invalid Spotify player response');
    }
    const playing = body !== null && body.is_playing === true;
    await withToken((token) => spotifySend(token, 'PUT', playing ? '/me/player/pause' : '/me/player/play'));
    await refreshSpotifyPlayback();
  } catch (error) {
    await broadcast({ connected: true, playback: { kind: 'error', message: spotifyErrorText(error) }, liked: false, likeError: '' });
  } finally {
    playbackBusy = false;
  }
}

export function hydrateSpotify(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = loadSession().finally(() => {
      hydratePromise = null;
    });
  }
  return hydratePromise;
}

async function loadSession(): Promise<void> {
  if (!isTauriRuntime()) {
    patchSpotify({ hydrated: true, connected: false });
    return;
  }
  try {
    const secret = await loadSpotifySecret();
    const connected = Boolean(secret && (secret.accessToken || secret.refreshToken));
    patchSpotify({
      hydrated: true,
      connected,
      reauthRequired: false,
      displayName: connected ? useSpotifyStore.getState().displayName : '',
      nowPlaying: connected ? useSpotifyStore.getState().nowPlaying : disconnectedNowPlaying(),
    });
    if (!connected) return;
    const profile = await withToken((token) => spotifySend(token, 'GET', '/me'));
    const mapped = mapProfile(profile);
    patchSpotify({ displayName: mapped.displayName, reauthRequired: false });
  } catch (error) {
    console.error('[nordly:spotify] session load failed', error);
    const reauthRequired = useSpotifyStore.getState().reauthRequired;
    patchSpotify({
      hydrated: true,
      connectError: reauthRequired ? null : connectFailure(error),
    });
  }
}

export async function connectSpotify(): Promise<void> {
  const clientId = spotifyClientId();
  if (!clientId) throw new Error('Spotify client id is not configured');
  if (!isTauriRuntime() || !window.nordly?.spotify) {
    patchSpotify({ connectError: { kind: 'desktop' } });
    throw new Error('Spotify connect requires the desktop app');
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
  oauthGeneration += 1;
  stopWatch();
  if (volumeTimer !== null) window.clearTimeout(volumeTimer);
  volumeTimer = null;
  volumeLocked = false;
  if (isTauriRuntime() && window.nordly?.spotify) await clearSpotifySecret();
  patchSpotify({
    connected: false,
    reauthRequired: false,
    displayName: '',
    oauthPending: false,
    connectError: null,
    volumePercent: null,
    volumeError: null,
    nowPlaying: disconnectedNowPlaying(),
  });
  if (isTauriRuntime()) await emit(SPOTIFY_NOW_EVENT, disconnectedNowPlaying());
}

export async function acceptSpotifyRedirect(code: string, state: string): Promise<void> {
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
    await saveSpotifySecret({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + tokens.expiresIn * 1000,
      codeVerifier: '',
      oauthState: '',
    });
    const profile = mapProfile(await withToken((token) => spotifySend(token, 'GET', '/me')));
    patchSpotify({
      hydrated: true,
      connected: true,
      reauthRequired: false,
      displayName: profile.displayName,
      oauthPending: false,
      connectError: null,
    });
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

export function setSpotifyVolumeLock(locked: boolean): void {
  volumeLocked = locked;
}

export async function refreshSpotifyVolume(): Promise<void> {
  if (!useSpotifyStore.getState().connected || volumeLocked) return;
  try {
    const body = await withToken((token) => spotifySend(token, 'GET', '/me/player'));
    if (volumeLocked) return;
    const volume = body === null ? null : mapDeviceVolume(body);
    if (volume === null) {
      patchSpotify({ volumeError: { kind: 'no_device' } });
      return;
    }
    patchSpotify({ volumePercent: volume, volumeError: null });
  } catch (error) {
    if (volumeLocked) return;
    console.error('[nordly:spotify] volume read failed', error);
    const message = error instanceof Error ? error.message : 'Spotify volume failed';
    patchSpotify({ volumeError: { kind: 'api', message } });
  }
}

export function queueSpotifyVolume(percent: number): void {
  const next = Math.max(0, Math.min(100, Math.round(percent)));
  if (volumeTimer !== null) window.clearTimeout(volumeTimer);
  volumeTimer = window.setTimeout(() => {
    volumeTimer = null;
    void commitSpotifyVolume(next);
  }, VOLUME_DEBOUNCE_MS);
}

async function commitSpotifyVolume(percent: number): Promise<void> {
  try {
    await withToken((token) =>
      spotifySend(token, 'PUT', `/me/player/volume?volume_percent=${percent}`),
    );
    patchSpotify({ volumePercent: percent, volumeError: null });
  } catch (error) {
    console.error('[nordly:spotify] volume write failed', error);
    if (error instanceof SpotifyHttpError && error.status === 404) {
      patchSpotify({ volumeError: { kind: 'no_device' } });
      return;
    }
    const message = error instanceof Error ? error.message : 'Spotify volume failed';
    patchSpotify({ volumeError: { kind: 'api', message } });
  }
}

export function initSpotifyLeader(): () => void {
  if (leaderStarted || !isTauriRuntime() || !isSpotifyConfigured()) return () => undefined;
  leaderStarted = true;
  void hydrateSpotify();

  const stop = listenEffects((track) => {
    track(
      listen('tray-popover:show', () => {
        void hydrateSpotify().then(() => {
          if (!useSpotifyStore.getState().connected) {
            void broadcast(disconnectedNowPlaying());
            return;
          }
          startWatch();
        });
      }),
    );
    track(
      listen('tray-popover:hide', () => {
        stopWatch();
      }),
    );
    track(
      listen<{ action?: string }>(SPOTIFY_CMD_EVENT, ({ payload }) => {
        if (payload?.action === 'like') void toggleLike();
        if (payload?.action === 'playback') void toggleSpotifyPlayback();
      }),
    );
  });

  return () => {
    leaderStarted = false;
    stopWatch();
    stop();
  };
}
