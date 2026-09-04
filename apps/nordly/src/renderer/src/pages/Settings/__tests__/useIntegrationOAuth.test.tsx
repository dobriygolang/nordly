import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nordly-i18n', () => {
  const t = (key: string, params?: { detail?: string }): string =>
    params?.detail ? `${key}:${params.detail}` : key;
  return { useT: () => t };
});
vi.mock('@features/calendar/api/calendarClient', () => ({
  getTrackerSettings: vi.fn(),
}));
vi.mock('@features/calendar/api/googleCalendarState', () => ({
  applyTrackerSettings: vi.fn(),
  getGoogleCalendarConnection: vi.fn(),
  isGoogleCalendarConnectionFresh: vi.fn(() => false),
}));
vi.mock('@shared/model/features', () => ({
  isCloudEnabled: vi.fn(() => false),
}));
vi.mock('@shared/sync/syncConfig', () => ({
  isCloudApiAvailable: vi.fn(() => false),
}));

import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { integrationOAuthMailbox } from '@shared/lib/integrationOAuthMailbox';
import { getTrackerSettings, type TrackerSettings } from '@features/calendar/api/calendarClient';
import { isCloudEnabled } from '@shared/model/features';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { useIntegrationOAuth } from '../useIntegrationOAuth';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ERROR_KEYS = {
  load: 'load',
  oauth: 'oauth',
  oauthTimeout: 'timeout',
  oauthDetail: 'oauthDetail',
};
const isConnected = (): boolean => false;

let container: HTMLDivElement;
let root: Root;
let latest: ReturnType<typeof useIntegrationOAuth> | null;

function Harness(): ReactElement {
  latest = useIntegrationOAuth({
    event: NORDLY_EVENTS.zoomOAuth,
    isConnected,
    errorKeys: ERROR_KEYS,
    logPrefix: 'zoom',
  });
  return createElement('div');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isCloudEnabled).mockReturnValue(false);
  vi.mocked(isCloudApiAvailable).mockReturnValue(false);
  latest = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('useIntegrationOAuth', () => {
  it('consumes an OAuth result queued before mount', async () => {
    integrationOAuthMailbox.publish(NORDLY_EVENTS.zoomOAuth, {
      status: 'error',
      detail: 'denied',
    });

    await act(async () => {
      root.render(createElement(Harness));
    });

    expect(latest?.error).toBe('oauthDetail:denied');
  });

  it('finishes the initial load when cloud integrations are disabled', async () => {
    await act(async () => {
      root.render(createElement(Harness));
    });

    expect(latest?.loading).toBe(false);
    expect(getTrackerSettings).not.toHaveBeenCalled();
  });

  it('ignores a stale settings response after a newer load completes', async () => {
    vi.mocked(isCloudEnabled).mockReturnValue(true);
    vi.mocked(isCloudApiAvailable).mockReturnValue(true);
    let resolveFirst!: (value: TrackerSettings) => void;
    const first = new Promise<TrackerSettings>((resolve) => {
      resolveFirst = resolve;
    });
    const older: TrackerSettings = {
      googleCalendarConnected: false,
      googleReauthRequired: false,
      googleCalendarId: '',
      zoomConnected: false,
      zoomReauthRequired: false,
    };
    const newer: TrackerSettings = {
      ...older,
      zoomConnected: true,
    };
    vi.mocked(getTrackerSettings)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(newer);

    await act(async () => {
      root.render(createElement(Harness));
    });
    await act(async () => {
      await latest!.load();
    });
    expect(latest?.settings).toEqual(newer);

    await act(async () => {
      resolveFirst(older);
      await first;
    });
    expect(latest?.settings).toEqual(newer);
  });
});
