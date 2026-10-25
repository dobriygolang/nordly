import { expect, it, vi } from 'vitest';
vi.mock('@features/focus/repository/focusStore', () => ({ focusStoreList: vi.fn(async () => []) }));
vi.mock('@shared/sync/syncConfig', () => ({ isSyncEnabled: () => true }));
vi.mock('@shared/lib/network', () => ({ canReachNetwork: () => true }));
vi.mock('@features/focus/remote/focusRemote', async (original) => ({ ...await original<typeof import('@features/focus/remote/focusRemote')>(), remoteGetStats: vi.fn() }));
import { getStats } from './focusClient';
import { remoteGetStats, type NordlyStats } from '../remote/focusRemote';
it('publishes local statistics before a pending cloud response and still surfaces its failure', async () => {
  let reject!: (error: Error) => void;
  vi.mocked(remoteGetStats).mockImplementationOnce(() => new Promise<NordlyStats>((_resolve, fail) => { reject = fail; }));
  const local = vi.fn();
  const pending = getStats('2026-10-25', local);
  await vi.waitFor(() => expect(local).toHaveBeenCalledTimes(1));
  expect(local.mock.calls[0]![0].totalFocusedSeconds).toBe(0);
  const failure = expect(pending).rejects.toThrow('cloud failed');
  reject(new Error('cloud failed'));
  await failure;
});
