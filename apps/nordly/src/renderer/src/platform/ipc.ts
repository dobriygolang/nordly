// Shared IPC types — narrow surface for the Nordly Tauri shell.

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
  on: <K extends keyof typeof eventChannels>(
    channel: K,
    listener: (payload: EventPayload[K]) => void,
  ) => () => void;
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
  mode?: 'pomodoro' | 'stopwatch';
}

export interface EventPayload {
  deepLink: { url: string };
  authChanged: AuthSession | null;
}
