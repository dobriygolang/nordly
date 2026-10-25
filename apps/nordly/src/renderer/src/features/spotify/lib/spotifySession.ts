import { translate } from '@nordly-i18n';
import { emit, listen } from '@tauri-apps/api/event';

import { isTauriRuntime } from '@platform/runtime';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { patchSettings, readSettings } from '@shared/model/settings';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { listenEffects } from '@shared/lib/tauriListen';

import { abortSpotifyPlaybackRequests, SpotifyHttpError, exchangeAuthorizationCode, refreshAccessToken, spotifyAuthRetryAt, spotifyRetryAt, spotifySend } from '../remote/spotifyRemote';
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
let integrationEpoch = 0;
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
  if (!useSpotifyStore.getState().enabled) throw new Error('Spotify integration is disabled');
  const epoch = integrationEpoch;
  const token = await validAccessToken();
  if (epoch !== integrationEpoch || !useSpotifyStore.getState().enabled) throw new Error('Spotify operation was cancelled');
  try {
    return await fn(token);
  } catch (error) {
    if (!(error instanceof SpotifyHttpError) || error.status !== 401) throw error;
    const refreshed = await singleFlight(async () => forceRefresh(await readSecret()));
    if (epoch !== integrationEpoch || !useSpotifyStore.getState().enabled) throw new Error('Spotify operation was cancelled');
    if (refreshed === token) throw error;
    return fn(refreshed);
  }
}

async function broadcast(now: SpotifyNowPlaying): Promise<void> {
  patchSpotify({ nowPlaying: now });
  if (!isTauriRuntime()) return;
  await emit(SPOTIFY_NOW_EVENT, now);
}

async function readNowPlaying(epoch: number): Promise<SpotifyNowPlaying> {
  const body = await withToken((token) =>
    spotifySend(token, 'GET', '/me/player/currently-playing?additional_types=track,episode'),
  );
  if (epoch !== integrationEpoch) return disconnectedNowPlaying();
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
  if (!useSpotifyStore.getState().enabled) return Promise.resolve();
  if (playbackRefresh) return playbackRefresh;
  if (Date.now() < spotifyRetryAt() || Date.now() - lastPlaybackReadAt < 1000) return Promise.resolve();
  lastPlaybackReadAt = Date.now();
  const pending = readPlayback().finally(() => {
    if (playbackRefresh === pending) playbackRefresh = null;
  });
  playbackRefresh = pending;
  return pending;
}

async function readPlayback(): Promise<void> {
  const epoch = integrationEpoch;
  if (!useSpotifyStore.getState().connected) {
    await broadcast(disconnectedNowPlaying());
    return;
  }
  try {
    const now = await readNowPlaying(epoch);
    if (epoch !== integrationEpoch) return;
    await broadcast(now);
  } catch (error) {
    if (epoch !== integrationEpoch) return;
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
  if (!useSpotifyStore.getState().enabled || !useSpotifyStore.getState().connected) return;
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
  if (!useSpotifyStore.getState().enabled || !current.connected || playback.kind !== 'track' || current.likeError) return;
  const trackId = playback.trackId;
  const epoch = integrationEpoch;
  try {
    await withToken((token) =>
      spotifySend(
        token,
        current.liked ? 'DELETE' : 'PUT',
        `/me/library?uris=${encodeURIComponent(`spotify:track:${trackId}`)}`,
      ),
    );
    if (epoch !== integrationEpoch) return;
    const latest = useSpotifyStore.getState().nowPlaying;
    if (latest.playback.kind !== 'track' || latest.playback.trackId !== trackId) return;
    await broadcast({ ...latest, liked: !current.liked, likeError: '' });
  } catch (error) {
    const message = spotifyErrorText(error);
    if (epoch !== integrationEpoch) return;
    console.error('[nordly:spotify] like failed', error);
    await broadcast({ ...current, likeError: message });
  }
}

export function spotifyErrorText(error: unknown): string {
  if (error instanceof SpotifyHttpError) {
    if (error.status === 429 && error.reason === 'QUOTA_EXCEEDED') return translate('nordly.spotify.error.quota');
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
  if (!useSpotifyStore.getState().enabled || !useSpotifyStore.getState().connected) return Promise.resolve();
  desiredPlayback = playing;
  if (playbackCommand) return playbackCommand;
  playbackCommand = (async () => {
    while (desiredPlayback !== null) {
      const epoch = integrationEpoch;
      const target = desiredPlayback;
      desiredPlayback = null;
      try {
        await withToken((token) => spotifySend(token, 'PUT', target ? '/me/player/play' : '/me/player/pause'));
        if (epoch !== integrationEpoch) continue;
        const current = useSpotifyStore.getState().nowPlaying;
        if (current.playback.kind === 'track' || current.playback.kind === 'other') {
          await broadcast({ ...current, playback: { ...current.playback, isPlaying: target } });
        }
      } catch (error) {
        if (epoch !== integrationEpoch) continue;
        await broadcast({ connected: true, playback: { kind: 'error', message: spotifyErrorText(error) }, liked: false, likeError: '' });
      }
    }
  })().finally(() => { playbackCommand = null; });
  return playbackCommand;
}

export function hydrateSpotify(): Promise<void> {
  if (!useSpotifyStore.getState().enabled || useSpotifyStore.getState().hydrated) return Promise.resolve();
  if (!hydratePromise) {
    const pending = loadSession().finally(() => {
      if (hydratePromise === pending) hydratePromise = null;
    });
    hydratePromise = pending;
  }
  return hydratePromise;
}

async function loadSession(): Promise<void> {
  const epoch = integrationEpoch;
  if (!isTauriRuntime()) {
    patchSpotify({ hydrated: true, connected: false });
    return;
  }
  try {
    const secret = await loadSpotifySecret();
    if (epoch !== integrationEpoch) return;
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
    if (epoch !== integrationEpoch) return;
    const mapped = mapProfile(profile);
    patchSpotify({ displayName: mapped.displayName, reauthRequired: false });
  } catch (error) {
    if (epoch !== integrationEpoch) return;
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
  if (!useSpotifyStore.getState().enabled) return;
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
  if (!useSpotifyStore.getState().enabled) return;
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
  if (!useSpotifyStore.getState().enabled || !useSpotifyStore.getState().connected || volumeLocked || volumeWrite || queuedVolume !== null) return Promise.resolve();
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
  if (!useSpotifyStore.getState().enabled || !useSpotifyStore.getState().connected) return;
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

/** Pause the integration without revoking or removing saved OAuth credentials. */
export function setSpotifyEnabled(enabled: boolean): void {
  patchSettings({ spotifyEnabled: enabled });
  applySpotifyEnabled(enabled);
}

function applySpotifyEnabled(enabled: boolean): void {
  if (useSpotifyStore.getState().enabled === enabled) return;
  integrationEpoch += 1;
  patchSpotify({ enabled, nowPlaying: disconnectedNowPlaying(), volumeError: null, connectError: null, oauthPending: false });
  if (!enabled) {
    oauthGeneration += 1;
    stopWatch();
    abortSpotifyPlaybackRequests();
    if (volumeTimer !== null) window.clearTimeout(volumeTimer);
    volumeTimer = null;
    queuedVolume = null;
    desiredPlayback = null;
    volumeVersion += 1;
    volumeSession += 1;
    hydratePromise = null;
    playbackRefresh = null;
    lastPlaybackReadAt = 0;
    void broadcast(disconnectedNowPlaying()).catch((error) => console.error('[nordly:spotify] pause broadcast failed', error));
    return;
  }
  void hydrateSpotify().then(() => {
    if (useSpotifyStore.getState().enabled && playbackWatchers > 0) startWatch();
  }).catch((error) => console.error('[nordly:spotify] resume failed', error));
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
  const syncEnabled = () => applySpotifyEnabled(readSettings().spotifyEnabled);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, syncEnabled);
  syncEnabled();
  void hydrateSpotify();

  let stopTrayWatch: (() => void) | null = null;
  let trayVisible = false;
  const stop = listenEffects((track) => {
    track(
      listen('tray-popover:show', () => {
        trayVisible = true;
        stopTrayWatch?.();
        stopTrayWatch = watchSpotifyPlayback();
        void hydrateSpotify().then(() => {
          if (!trayVisible) return;
          if (!useSpotifyStore.getState().connected) {
            void broadcast(disconnectedNowPlaying());
            return;
          }
          if (useSpotifyStore.getState().enabled) startWatch();
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
    window.removeEventListener(NORDLY_EVENTS.settingsChanged, syncEnabled);
    stopTrayWatch?.();
    stop();
  };
}
