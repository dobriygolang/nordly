// Shared IPC types — narrow surface for the Nordly Tauri shell.
import type { TimerMode } from '@shared/model/settings';

export const eventChannels = {
  deepLink: 'app:deep-link',
  authChanged: 'auth:changed',
} as const;

export interface NordlyAPI {
  auth: {
    session: () => Promise<AuthSession | null>;
    persist: (s: AuthSession) => Promise<void>;
    logout: () => Promise<void>;
  };
  pomodoro: {
    load: () => Promise<PomodoroSnapshot | null>;
    save: (s: PomodoroSnapshot) => Promise<void>;
  };
  shell: {
    openExternal: (url: string) => Promise<void>;
  };
  window: {
    setTrafficLights: (visible: boolean) => Promise<void>;
  };
  deepLink?: {
    /** URL that cold-launched the app via a custom scheme, if any. */
    initial: () => Promise<string | null>;
  };
  vault?: {
    passLoad: (userId: string) => Promise<string | null>;
    passSave: (userId: string, passphrase: string) => Promise<void>;
    passClear: (userId: string) => Promise<void>;
  };
  /** Device Spotify session. Not cleared on Nordly sign-out. */
  spotify?: {
    load: () => Promise<SpotifySecret | null>;
    save: (secret: SpotifySecret) => Promise<void>;
    clear: () => Promise<void>;
  };
  spotifyPlayer?: {
    read: (requestAccess: boolean) => Promise<SpotifyLocalSnapshot>;
    playback: (playing: boolean) => Promise<SpotifyLocalSnapshot>;
    volume: (percent: number) => Promise<SpotifyLocalSnapshot>;
  };
  on: <K extends keyof typeof eventChannels>(
    channel: K,
    listener: (payload: EventPayload[K]) => void,
  ) => () => void;
}

export interface SpotifySecret {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  codeVerifier: string;
  oauthState: string;
}

export type SpotifyLocalStatus = 'ready' | 'not_running' | 'permission_required' | 'permission_denied' | 'unsupported';
export interface SpotifyLocalSnapshot {
  status: SpotifyLocalStatus;
  title: string;
  artist: string;
  trackId: string | null;
  playing: boolean;
  volume: number | null;
}

export interface AuthSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface PomodoroSnapshot {
  remainSec: number;
  running: boolean;
  savedAt: number;
  mode?: TimerMode;
}

export interface EventPayload {
  deepLink: { url: string };
  authChanged: AuthSession | null;
}
