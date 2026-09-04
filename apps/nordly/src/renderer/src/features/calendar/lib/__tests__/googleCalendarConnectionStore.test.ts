import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTrackerSettings: vi.fn(),
  invalidateCache: vi.fn(),
  session: { authKind: 'cloud' as 'cloud' | 'local' | null },
}));

vi.mock('@features/calendar/api/calendarClient', () => ({
  getTrackerSettings: mocks.getTrackerSettings,
}));
vi.mock('@features/calendar/lib/googleCalendarCache', () => ({
  invalidateGoogleCalendarCache: mocks.invalidateCache,
}));
vi.mock('@shared/model/features', () => ({
  isCloudEnabled: () => true,
}));
vi.mock('@shared/model/session', () => ({
  AuthKind: { Local: 'local', Cloud: 'cloud' },
  useSessionStore: {
    getState: () => mocks.session,
  },
}));

import { AuthKind } from '@shared/model/session';

import {
  applyTrackerSettings,
  getGoogleCalendarConnection,
  googleConnectionFromTrackerSettings,
  GoogleCalendarConnectionStatus,
  refreshGoogleCalendarConnection,
  resetGoogleCalendarConnection,
} from '../googleCalendarConnectionStore';

const CONNECTED = {
  googleCalendarConnected: true,
  googleReauthRequired: false,
  googleCalendarId: 'primary',
  zoomConnected: false,
  zoomReauthRequired: false,
};

describe('Google Calendar connection state', () => {
  afterEach(() => {
    resetGoogleCalendarConnection();
    mocks.session.authKind = AuthKind.Cloud;
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('maps authoritative settings to connected, disconnected, and reauth states', () => {
    expect(googleConnectionFromTrackerSettings(CONNECTED, 1).status).toBe(
      GoogleCalendarConnectionStatus.Connected,
    );
    expect(
      googleConnectionFromTrackerSettings(
        { ...CONNECTED, googleCalendarConnected: false },
        1,
      ).status,
    ).toBe(GoogleCalendarConnectionStatus.Disconnected);
    expect(
      googleConnectionFromTrackerSettings(
        { ...CONNECTED, googleReauthRequired: true },
        1,
      ).status,
    ).toBe(GoogleCalendarConnectionStatus.Reauth);
  });

  it('retains the last connected state and cache when settings refresh fails', async () => {
    applyTrackerSettings(CONNECTED);
    mocks.getTrackerSettings.mockRejectedValueOnce(new TypeError('network offline'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await refreshGoogleCalendarConnection({ force: true });

    expect(getGoogleCalendarConnection()).toMatchObject({
      status: GoogleCalendarConnectionStatus.OfflineCached,
      connected: true,
      reauthRequired: false,
      settings: CONNECTED,
      error: {
        provider: 'google',
        kind: 'fetch',
        message: 'network offline',
      },
    });
    expect(mocks.invalidateCache).not.toHaveBeenCalled();

    applyTrackerSettings({
      ...CONNECTED,
      googleCalendarConnected: false,
    });
    expect(getGoogleCalendarConnection().status).toBe(
      GoogleCalendarConnectionStatus.Disconnected,
    );
    expect(mocks.invalidateCache).toHaveBeenCalledTimes(1);
  });

  it('keeps cloud-profile cache available when the API session is unavailable', async () => {
    mocks.getTrackerSettings.mockResolvedValueOnce(null);

    await refreshGoogleCalendarConnection({ force: true });

    expect(getGoogleCalendarConnection()).toMatchObject({
      status: GoogleCalendarConnectionStatus.Unknown,
      ready: false,
      error: {
        provider: 'google',
        kind: 'fetch',
      },
    });
    expect(mocks.invalidateCache).not.toHaveBeenCalled();
  });

  it('marks a local profile as disconnected without reporting a provider failure', async () => {
    mocks.session.authKind = AuthKind.Local;
    mocks.getTrackerSettings.mockResolvedValueOnce(null);

    await refreshGoogleCalendarConnection({ force: true });

    expect(getGoogleCalendarConnection()).toMatchObject({
      status: GoogleCalendarConnectionStatus.Disconnected,
      ready: true,
      error: null,
    });
  });

  it('resets user-scoped state and ignores a previous user refresh', async () => {
    let resolveSettings!: (settings: typeof CONNECTED) => void;
    mocks.getTrackerSettings.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSettings = resolve;
      }),
    );

    const refresh = refreshGoogleCalendarConnection({ force: true });
    resetGoogleCalendarConnection('previous-user');
    resolveSettings(CONNECTED);
    await refresh;

    expect(getGoogleCalendarConnection()).toMatchObject({
      status: GoogleCalendarConnectionStatus.Unknown,
      settings: null,
      ready: false,
    });
    expect(mocks.invalidateCache).toHaveBeenCalledWith('previous-user');
  });
});
