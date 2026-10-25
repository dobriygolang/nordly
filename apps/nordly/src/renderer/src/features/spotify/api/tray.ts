import { emit } from '@tauri-apps/api/event';

import { isTauriRuntime } from '@platform/runtime';

import {
  disconnectedNowPlaying,
  SPOTIFY_CMD_EVENT,
  SPOTIFY_NOW_EVENT,
  type SpotifyNowPlaying,
} from '../lib/nowPlaying';
import { trayMusicLine, type TrayMusicLine } from '../lib/trayCopy';

export { disconnectedNowPlaying, SPOTIFY_NOW_EVENT, type SpotifyNowPlaying };
export { trayMusicLine, type TrayMusicLine };

export function sendSpotifyLike(): void {
  if (!isTauriRuntime()) return;
  void emit(SPOTIFY_CMD_EVENT, { action: 'like' }).catch((error) => {
    console.error('[nordly:spotify] like command failed', error);
  });
}

export function sendSpotifyPlayback(): void {
  if (!isTauriRuntime()) return;
  void emit(SPOTIFY_CMD_EVENT, { action: 'playback' }).catch((error) => {
    console.error('[nordly:spotify] playback command failed', error);
  });
}
