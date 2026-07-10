import { create } from 'zustand';

import type { SyncStatus } from '@shared/sync/types';

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  serverReachable: boolean;
  sessionReauthRequired: boolean;
  cloudSyncBlocked: boolean;
  cloudSyncBlockReason: 'cloud_sync_disabled' | 'device_limit_exceeded' | null;
  /** Hide sync banner until the underlying issue changes (user dismissed). */
  dismissedSyncBannerKey: string | null;
  setStatus: (status: SyncStatus) => void;
  setPendingCount: (n: number) => void;
  setLastSyncedAt: (ts: number) => void;
  setLastError: (msg: string | null) => void;
  setServerReachable: (ok: boolean) => void;
  setSessionReauthRequired: (required: boolean) => void;
  setDismissedSyncBannerKey: (key: string | null) => void;
  setCloudSyncBlocked: (
    blocked: boolean,
    reason?: 'cloud_sync_disabled' | 'device_limit_exceeded' | null,
  ) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: 'idle',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  serverReachable: true,
  sessionReauthRequired: false,
  cloudSyncBlocked: false,
  cloudSyncBlockReason: null,
  dismissedSyncBannerKey: null,
  setStatus: (status) => set({ status }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSyncedAt: (lastSyncedAt) => set({ lastSyncedAt, lastError: null }),
  setLastError: (lastError) => set({ lastError, status: lastError ? 'error' : 'idle' }),
  setServerReachable: (serverReachable) => set({ serverReachable }),
  setSessionReauthRequired: (sessionReauthRequired) => set({ sessionReauthRequired }),
  setDismissedSyncBannerKey: (dismissedSyncBannerKey) => set({ dismissedSyncBannerKey }),
  setCloudSyncBlocked: (cloudSyncBlocked, reason = null) =>
    set({ cloudSyncBlocked, cloudSyncBlockReason: cloudSyncBlocked ? reason : null }),
}));
