import { translate } from '@nordly-i18n';
import { emit, listen } from '@tauri-apps/api/event';

import { isTauriRuntime } from '@platform/runtime';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { listenEffects } from '@shared/lib/tauriListen';

import { SpotifyHttpError, exchangeAuthorizationCode, refreshAccessToken, spotifyAuthRetryAt, spotifyRetryAt, spotifySend } from '../remote/spotifyRemote';
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
const VOLUME_SEND_INTERVAL_MS = 120;
const TOKEN_SKEW_MS = 60_000;

let hydratePromise: Promise<void> | null = null;
let refreshPromise: Promise<string> | null = null;
let oauthGeneration = 0;
let pollTimer: number | null = null;
let volumeTimer: number | null = null;
let volumeLocked = false;
let volumeVersion = 0;
let volumeSession = 0;
let queuedVolume: number | null = null;
let volumeWrite: Promise<void> | null = null;
let volumeRead: Promise<void> | null = null;
let lastVolumeSentAt = 0;
let lastVolumeReadAt = 0;
let confirmedVolume: number | null = null;
let leaderStarted = false;
let playbackRefresh: Promise<void> | null = null;
let lastPlaybackReadAt = 0;
let playbackWatchers = 0;

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
  const previous = useSpotifyStore.getState().nowPlaying;
  if (previous.playback.kind === 'track' && previous.playback.trackId === playback.trackId) {
    return { connected: true, playback, liked: previous.liked, likeError: previous.likeError };
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

export function refreshSpotifyPlayback(): Promise<void> {
  if (playbackRefresh) return playbackRefresh;
  if (Date.now() < spotifyRetryAt() || Date.now() - lastPlaybackReadAt < 1000) return Promise.resolve();
  lastPlaybackReadAt = Date.now();
  playbackRefresh = readPlayback().finally(() => { playbackRefresh = null; });
  return playbackRefresh;
}

async function readPlayback(): Promise<void> {
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

/** All visible consumers share a single poller in the main webview. */
export function watchSpotifyPlayback(): () => void {
  playbackWatchers += 1;
  if (playbackWatchers === 1) startWatch();
  return () => {
    playbackWatchers -= 1;
    if (playbackWatchers === 0) stopWatch();
  };
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
    if (error.status === 429) return translate('nordly.spotify.error.rate_limit');
    if (error.status === 404) return translate('nordly.spotify.error.device');
    if (error.status === 403) {
      if (/premium/i.test(error.message)) return translate('nordly.spotify.error.premium');
      if (/scope/i.test(error.message)) return translate('nordly.spotify.error.scope');
      return translate('nordly.spotify.error.access');
    }
  }
  return error instanceof Error ? error.message : 'Spotify playback failed';
}

/** Timer state is authoritative: PUT a desired state without a preliminary GET. */
let desiredPlayback: boolean | null = null;
let playbackCommand: Promise<void> | null = null;
export function setSpotifyPlayback(playing: boolean): Promise<void> {
  if (!useSpotifyStore.getState().connected) return Promise.resolve();
  desiredPlayback = playing;
  if (playbackCommand) return playbackCommand;
  playbackCommand = (async () => {
    while (desiredPlayback !== null) {
      const target = desiredPlayback;
      desiredPlayback = null;
      try {
        await withToken((token) => spotifySend(token, 'PUT', target ? '/me/player/play' : '/me/player/pause'));
        const current = useSpotifyStore.getState().nowPlaying;
        if (current.playback.kind === 'track' || current.playback.kind === 'other') {
          await broadcast({ ...current, playback: { ...current.playback, isPlaying: target } });
        }
      } catch (error) {
        await broadcast({ connected: true, playback: { kind: 'error', message: spotifyErrorText(error) }, liked: false, likeError: '' });
      }
    }
  })().finally(() => { playbackCommand = null; });
  return playbackCommand;
}

export function hydrateSpotify(): Promise<void> {
  if (useSpotifyStore.getState().hydrated) return Promise.resolve();
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
      connectError: null,
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
      connectError: useSpotifyStore.getState().connected || reauthRequired ? null : connectFailure(error),
      ...(useSpotifyStore.getState().connected ? { nowPlaying: { connected: true, playback: { kind: 'error' as const, message: spotifyErrorText(error) }, liked: false, likeError: '' } } : {}),
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
  oauthGeneration += 1;
  stopWatch();
  if (volumeTimer !== null) window.clearTimeout(volumeTimer);
  volumeTimer = null;
  volumeLocked = false;
  volumeVersion += 1;
  volumeSession += 1;
  queuedVolume = null;
  confirmedVolume = null;
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
    patchSpotify({
      hydrated: true,
      connected: true,
      reauthRequired: false,
      displayName: '',
      nowPlaying: disconnectedNowPlaying(),
      oauthPending: false,
      connectError: null,
    });
    if (playbackWatchers > 0) startWatch();
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

export function refreshSpotifyVolume(): Promise<void> {
  if (!useSpotifyStore.getState().connected || volumeLocked || volumeWrite || queuedVolume !== null) return Promise.resolve();
  if (volumeRead) return volumeRead;
  if (Date.now() < spotifyRetryAt() || Date.now() - lastVolumeReadAt < 1500) return Promise.resolve();
  lastVolumeReadAt = Date.now();
  const requestedVersion = volumeVersion;
  volumeRead = readSpotifyVolume(requestedVersion).finally(() => { volumeRead = null; });
  return volumeRead;
}

async function readSpotifyVolume(requestedVersion: number): Promise<void> {
  try {
    const body = await withToken((token) => spotifySend(token, 'GET', '/me/player'));
    if (volumeLocked || requestedVersion !== volumeVersion) return;
    const volume = body === null ? null : mapDeviceVolume(body);
    if (volume === null) {
      patchSpotify({ volumeError: { kind: 'no_device' } });
      return;
    }
    confirmedVolume = volume;
    patchSpotify({ volumePercent: volume, volumeError: null });
  } catch (error) {
    if (volumeLocked || requestedVersion !== volumeVersion) return;
    console.error('[nordly:spotify] volume read failed', error);
    patchSpotify({ volumeError: { kind: 'api', message: spotifyErrorText(error) } });
  }
}

export function queueSpotifyVolume(percent: number): void {
  if (!useSpotifyStore.getState().connected) return;
  const next = Math.max(0, Math.min(100, Math.round(percent)));
  volumeVersion += 1;
  queuedVolume = next;
  // The thumb follows the user's input, including after pointer-up. API latency
  // must not reset it to the last device reading.
  patchSpotify({ volumePercent: next, volumeError: null });
  scheduleVolumeWrite();
}

function scheduleVolumeWrite(): void {
  if (volumeWrite || volumeTimer !== null || queuedVolume === null) return;
  const wait = Math.max(0, lastVolumeSentAt + VOLUME_SEND_INTERVAL_MS - Date.now());
  if (wait > 0) {
    volumeTimer = window.setTimeout(() => {
      volumeTimer = null;
      scheduleVolumeWrite();
    }, wait);
    return;
  }
  const target = queuedVolume;
  const requestedVersion = volumeVersion;
  queuedVolume = null;
  lastVolumeSentAt = Date.now();
  volumeWrite = commitSpotifyVolume(target, requestedVersion).finally(() => {
    volumeWrite = null;
    scheduleVolumeWrite();
  });
}

async function commitSpotifyVolume(percent: number, requestedVersion: number): Promise<void> {
  const session = volumeSession;
  try {
    await withToken((token) =>
      spotifySend(token, 'PUT', `/me/player/volume?volume_percent=${percent}`),
    );
    if (!useSpotifyStore.getState().connected || session !== volumeSession) return;
    confirmedVolume = percent;
    if (requestedVersion === volumeVersion) patchSpotify({ volumeError: null });
  } catch (error) {
    if (requestedVersion !== volumeVersion) return;
    console.error('[nordly:spotify] volume write failed', error);
    patchSpotify({
      volumePercent: confirmedVolume,
      volumeError: error instanceof SpotifyHttpError && error.status === 404
        ? { kind: 'no_device' } : { kind: 'api', message: spotifyErrorText(error) },
    });
  }
}

export function syncSpotifyWithTimer(): () => void {
  return usePomodoroStore.subscribe((state, previous) => {
    if (state.running !== previous.running) void setSpotifyPlayback(state.running);
  });
}

export function initSpotifyLeader(): () => void {
  if (leaderStarted || !isTauriRuntime() || !isSpotifyConfigured()) return () => undefined;
  leaderStarted = true;
  const stopTimerSync = syncSpotifyWithTimer();
  void hydrateSpotify();

  let stopTrayWatch: (() => void) | null = null;
  let trayVisible = false;
  const stop = listenEffects((track) => {
    track(
      listen('tray-popover:show', () => {
        trayVisible = true;
        void hydrateSpotify().then(() => {
          if (!trayVisible) return;
          if (!useSpotifyStore.getState().connected) {
            void broadcast(disconnectedNowPlaying());
            return;
          }
          stopTrayWatch?.();
          stopTrayWatch = watchSpotifyPlayback();
        });
      }),
    );
    track(
      listen('tray-popover:hide', () => {
        trayVisible = false;
        stopTrayWatch?.();
        stopTrayWatch = null;
      }),
    );
    track(
      listen<{ action?: string }>(SPOTIFY_CMD_EVENT, ({ payload }) => {
        if (payload?.action === 'like') void toggleLike();
      }),
    );
  });

  return () => {
    leaderStarted = false;
    trayVisible = false;
    stopTimerSync();
    stopTrayWatch?.();
    stop();
  };
}
