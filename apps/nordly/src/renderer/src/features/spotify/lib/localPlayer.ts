import { emit, listen } from '@tauri-apps/api/event';
import type { SpotifyLocalSnapshot } from '@platform/ipc';
import { isTauriRuntime } from '@platform/runtime';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { listenEffects } from '@shared/lib/tauriListen';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { patchSettings, readSettings } from '@shared/model/settings';
import { abortSpotifyLibraryRequests } from '../remote/spotifyRemote';
import { disconnectedNowPlaying, SPOTIFY_NOW_EVENT, SPOTIFY_POLL_MS, type SpotifyNowPlaying } from './nowPlaying';
import { patchSpotify, useSpotifyStore } from './spotifyStore';

let epoch = 0;
let revision = 0;
let watchers = 0;
let pollTimer: number | null = null;
let pendingRead: Promise<void> | null = null;
let leaderStarted = false;
let volumeVersion = 0;
let volumeLocked = false;
let queuedVolume: number | null = null;
let volumeWrite: Promise<void> | null = null;
let volumeTimer: number | null = null;
let lastVolumeWriteAt = 0;
let confirmedVolume: number | null = null;
let desiredPlayback: boolean | null = null;
let playbackWrite: Promise<void> | null = null;

function player() {
  const api = window.nordly?.spotifyPlayer;
  if (!api) throw new Error('Local Spotify control requires the desktop app');
  return api;
}

export function spotifyLocalError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function broadcastSpotifyNow(now: SpotifyNowPlaying): Promise<void> {
  patchSpotify({ nowPlaying: now });
  if (isTauriRuntime()) await emit(SPOTIFY_NOW_EVENT, now);
}

async function consume(snapshot: SpotifyLocalSnapshot, generation: number, requestedVolume: number): Promise<void> {
  if (generation !== epoch || !useSpotifyStore.getState().enabled) return;
  const ready = snapshot.status === 'ready';
  patchSpotify({ hydrated: true, connected: ready, localStatus: snapshot.status, localError: null });
  if (!volumeLocked && requestedVolume === volumeVersion) {
    confirmedVolume = snapshot.volume;
    patchSpotify({ volumePercent: snapshot.volume, volumeError: null });
  }
  const previous = useSpotifyStore.getState().nowPlaying;
  const sameTrack = snapshot.trackId !== null && previous.playback.kind === 'track' && previous.playback.trackId === snapshot.trackId;
  await broadcastSpotifyNow({
    connected: ready,
    playback: !ready || !snapshot.title ? { kind: 'empty' } : snapshot.trackId
      ? { kind: 'track', trackId: snapshot.trackId, title: snapshot.title, artist: snapshot.artist, isPlaying: snapshot.playing }
      : { kind: 'other', title: snapshot.title, artist: snapshot.artist, isPlaying: snapshot.playing },
    liked: sameTrack && previous.liked,
    likeError: sameTrack ? previous.likeError : '',
    canLike: useSpotifyStore.getState().libraryConnected,
  });
}

async function read(requestAccess: boolean): Promise<void> {
  const generation = epoch;
  const requestedRevision = revision;
  const requestedVolume = volumeVersion;
  try {
    const snapshot = await player().read(requestAccess);
    if (requestedRevision !== revision) return;
    await consume(snapshot, generation, requestedVolume);
  } catch (error) {
    if (generation !== epoch || requestedRevision !== revision) return;
    const message = spotifyLocalError(error);
    patchSpotify({ hydrated: true, connected: false, localError: message, volumePercent: null });
    await broadcastSpotifyNow({ connected: true, playback: { kind: 'error', message }, liked: false, likeError: '' });
  }
}

export function refreshSpotifyPlayback(): Promise<void> {
  if (!useSpotifyStore.getState().enabled) return Promise.resolve();
  if (!pendingRead) {
    const pending = read(false).finally(() => { if (pendingRead === pending) pendingRead = null; });
    pendingRead = pending;
  }
  return pendingRead;
}

export function hydrateSpotify(): Promise<void> {
  if (useSpotifyStore.getState().hydrated) return Promise.resolve();
  return refreshSpotifyPlayback();
}

/** Only this explicit settings action can show the macOS automation dialog. */
export async function requestSpotifyLocalAccess(): Promise<void> {
  if (!useSpotifyStore.getState().enabled) return;
  revision += 1;
  await read(true);
}

function stopPoll(): void {
  if (pollTimer !== null) window.clearInterval(pollTimer);
  pollTimer = null;
}

function startPoll(): void {
  if (!useSpotifyStore.getState().enabled || pollTimer !== null) return;
  void refreshSpotifyPlayback();
  pollTimer = window.setInterval(() => { void refreshSpotifyPlayback(); }, SPOTIFY_POLL_MS);
}

export function watchSpotifyPlayback(): () => void {
  watchers += 1;
  startPoll();
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    watchers -= 1;
    if (watchers === 0) stopPoll();
  };
}

export function setSpotifyPlayback(playing: boolean): Promise<void> {
  if (!useSpotifyStore.getState().enabled) return Promise.resolve();
  desiredPlayback = playing;
  revision += 1;
  if (playbackWrite) return playbackWrite;
  playbackWrite = (async () => {
    while (desiredPlayback !== null) {
      const target = desiredPlayback;
      const generation = epoch;
      const requestedVolume = volumeVersion;
      desiredPlayback = null;
      try {
        const snapshot = await player().playback(target);
        if (desiredPlayback === null) await consume(snapshot, generation, requestedVolume);
      } catch (error) {
        if (generation !== epoch) continue;
        const message = spotifyLocalError(error);
        patchSpotify({ localError: message });
        await broadcastSpotifyNow({ connected: true, playback: { kind: 'error', message }, liked: false, likeError: '' });
      }
    }
  })().finally(() => { playbackWrite = null; });
  return playbackWrite;
}

export function syncSpotifyWithTimer(): () => void {
  return usePomodoroStore.subscribe((state, previous) => {
    if (state.running !== previous.running) void setSpotifyPlayback(state.running);
  });
}

export function setSpotifyVolumeLock(locked: boolean): void { volumeLocked = locked; }
export function refreshSpotifyVolume(): Promise<void> {
  if (volumeLocked || volumeWrite || queuedVolume !== null) return Promise.resolve();
  return refreshSpotifyPlayback();
}

export function queueSpotifyVolume(percent: number): void {
  if (!useSpotifyStore.getState().enabled || !useSpotifyStore.getState().connected) return;
  if (!Number.isFinite(percent)) throw new Error('Invalid Spotify volume');
  queuedVolume = Math.max(0, Math.min(100, Math.round(percent)));
  volumeVersion += 1;
  revision += 1;
  patchSpotify({ volumePercent: queuedVolume, volumeError: null });
  scheduleVolume();
}

function scheduleVolume(): void {
  if (volumeWrite || volumeTimer !== null || queuedVolume === null) return;
  const wait = Math.max(0, lastVolumeWriteAt + 120 - Date.now());
  if (wait > 0) {
    volumeTimer = window.setTimeout(() => { volumeTimer = null; scheduleVolume(); }, wait);
    return;
  }
  const target = queuedVolume;
  queuedVolume = null;
  const generation = epoch;
  const version = volumeVersion;
  lastVolumeWriteAt = Date.now();
  volumeWrite = (async () => {
    try {
      const snapshot = await player().volume(target);
      if (generation !== epoch) return;
      if (snapshot.status !== 'ready' || snapshot.volume === null) throw new Error('Spotify has no local audio session');
      confirmedVolume = snapshot.volume;
      if (version === volumeVersion) patchSpotify({ volumeError: null });
    } catch (error) {
      if (generation !== epoch || version !== volumeVersion) return;
      patchSpotify({ volumePercent: confirmedVolume, volumeError: { kind: 'api', message: spotifyLocalError(error) } });
    }
  })().finally(() => { volumeWrite = null; scheduleVolume(); });
}

export function setSpotifyEnabled(enabled: boolean): void {
  patchSettings({ spotifyEnabled: enabled });
  applyEnabled(enabled);
}

function applyEnabled(enabled: boolean): void {
  if (useSpotifyStore.getState().enabled === enabled) return;
  epoch += 1;
  revision += 1;
  volumeVersion += 1;
  queuedVolume = null;
  desiredPlayback = null;
  pendingRead = null;
  if (volumeTimer !== null) window.clearTimeout(volumeTimer);
  volumeTimer = null;
  patchSpotify({ enabled, localError: null, volumeError: null });
  if (!enabled) {
    stopPoll();
    abortSpotifyLibraryRequests();
    void broadcastSpotifyNow(disconnectedNowPlaying()).catch(console.error);
  } else {
    void refreshSpotifyPlayback();
    if (watchers > 0) startPoll();
  }
}

export function initLocalSpotifyLeader(): () => void {
  if (leaderStarted || !isTauriRuntime()) return () => undefined;
  leaderStarted = true;
  const syncEnabled = () => applyEnabled(readSettings().spotifyEnabled);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, syncEnabled);
  window.addEventListener('focus', refreshOnFocus);
  syncEnabled();
  void hydrateSpotify();
  const stopTimer = syncSpotifyWithTimer();
  let stopTray: (() => void) | null = null;
  const stopEvents = listenEffects((track) => {
    track(listen('tray-popover:show', () => { stopTray?.(); stopTray = watchSpotifyPlayback(); }));
    track(listen('tray-popover:hide', () => { stopTray?.(); stopTray = null; }));
  });
  return () => {
    leaderStarted = false;
    epoch += 1;
    stopTray?.();
    stopPoll();
    stopTimer();
    stopEvents();
    window.removeEventListener(NORDLY_EVENTS.settingsChanged, syncEnabled);
    window.removeEventListener('focus', refreshOnFocus);
  };
}

function refreshOnFocus(): void { void refreshSpotifyPlayback(); }
