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
  oauth?: {
    tokensLoad: (provider: OAuthProvider, userId: string) => Promise<OAuthTokenBlob | null>;
    tokensSave: (tokens: OAuthTokenBlob, userId: string) => Promise<void>;
    tokensClear: (provider: OAuthProvider, userId: string) => Promise<void>;
    pendingLoad: (provider: OAuthProvider, userId: string) => Promise<OAuthPendingBlob | null>;
    pendingSave: (pending: OAuthPendingBlob, userId: string) => Promise<void>;
    pendingClear: (provider: OAuthProvider, userId: string) => Promise<void>;
    loopbackStart: () => Promise<string>;
    loopbackWait: (expectedState: string, timeoutMs: number) => Promise<string>;
    loopbackCancel: () => Promise<void>;
  };
  on: <K extends keyof typeof eventChannels>(
    channel: K,
    listener: (payload: EventPayload[K]) => void,
  ) => () => void;
}

export type OAuthProvider = 'google' | 'zoom';

export interface OAuthTokenBlob {
  provider: OAuthProvider;
  refreshToken: string;
  accessToken: string;
  expiresAt: number;
  reauthRequired: boolean;
  accountEmail?: string;
}

export interface OAuthPendingBlob {
  provider: OAuthProvider;
  state: string;
  codeVerifier: string;
  redirectUri: string;
  expiresAt: number;
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
