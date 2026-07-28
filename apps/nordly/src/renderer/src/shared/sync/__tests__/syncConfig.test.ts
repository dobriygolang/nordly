import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/model/features', () => ({
  isCloudEnabled: vi.fn(() => true),
}));

import { isCloudEnabled } from '@shared/model/features';
import { useSessionStore } from '@shared/model/session';
import { useFeatureUsageStore } from '@shared/model/featureUsage';
import { useSyncStore } from '@shared/model/sync';

import { isCloudApiAvailable, isSyncEnabled, isSyncQueueEnabled } from '../syncConfig';

const LOCAL_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLOUD_USER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('sync gates for deferred auth', () => {
  beforeEach(() => {
    vi.mocked(isCloudEnabled).mockReturnValue(true);
    useSyncStore.getState().setCloudSyncBlocked(false);
    useFeatureUsageStore.getState().setDeviceRegistration(null);
  });

  afterEach(() => {
    vi.mocked(isCloudEnabled).mockReturnValue(true);
  });

  it('allows outbox enqueue for a local profile but blocks cloud API and sync push', () => {
    useSessionStore.setState({
      status: 'signed_in',
      authKind: 'local',
      userId: LOCAL_USER,
      accessToken: null,
      refreshToken: null,
      expiresAt: 0,
    });

    expect(isSyncQueueEnabled()).toBe(true);
    expect(isCloudApiAvailable()).toBe(false);
    expect(isSyncEnabled()).toBe(false);
  });

  it('enables cloud API + sync when cloud session has a fresh access token', () => {
    useSessionStore.setState({
      status: 'signed_in',
      authKind: 'cloud',
      userId: CLOUD_USER,
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 60_000,
    });
    useFeatureUsageStore.getState().setDeviceRegistration({
      deviceId: 'dev-1',
      devicesRegistered: 1,
      deviceLimit: 3,
      cloudSyncEnabled: true,
    });

    expect(isSyncQueueEnabled()).toBe(true);
    expect(isCloudApiAvailable()).toBe(true);
    expect(isSyncEnabled()).toBe(true);
  });

  it('still queues outbox when cloud access is expired (push waits for refresh)', () => {
    useSessionStore.setState({
      status: 'signed_in',
      authKind: 'cloud',
      userId: CLOUD_USER,
      accessToken: 'expired',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1,
    });
    useFeatureUsageStore.getState().setDeviceRegistration({
      deviceId: 'dev-1',
      devicesRegistered: 1,
      deviceLimit: 3,
      cloudSyncEnabled: true,
    });

    expect(isSyncQueueEnabled()).toBe(true);
    expect(isCloudApiAvailable()).toBe(false);
    expect(isSyncEnabled()).toBe(false);
  });

  it('disables queue entirely when LOCAL_ONLY / cloud is off', () => {
    vi.mocked(isCloudEnabled).mockReturnValue(false);
    useSessionStore.setState({
      status: 'signed_in',
      authKind: 'local',
      userId: LOCAL_USER,
      accessToken: null,
      refreshToken: null,
      expiresAt: 0,
    });

    expect(isSyncQueueEnabled()).toBe(false);
    expect(isCloudApiAvailable()).toBe(false);
    expect(isSyncEnabled()).toBe(false);
  });
});
