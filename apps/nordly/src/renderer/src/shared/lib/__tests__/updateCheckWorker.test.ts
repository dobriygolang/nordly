import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@shared/api/notifications', () => ({ notify: vi.fn() }));
vi.mock('@shared/lib/network', () => ({ canReachNetwork: () => true }));
vi.mock('../updater', async (original) => ({
  ...await original<typeof import('../updater')>(),
  isTauriRuntime: () => true,
  readAppVersion: vi.fn(async () => '0.0.62'),
  fetchPublishedVersion: vi.fn(async () => '0.0.63'),
  checkForUpdate: vi.fn(async () => ({ kind: 'installed', version: '0.0.63' })),
}));

let worker: typeof import('../updateCheckWorker');
let settings: typeof import('@shared/model/settings');
let updater: typeof import('../updater');
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T15:00:00Z'));
  worker = await import('../updateCheckWorker');
  settings = await import('@shared/model/settings');
  updater = await import('../updater');
  vi.mocked(updater.checkForUpdate).mockReset().mockResolvedValue({ kind: 'installed', version: '0.0.63' });
  vi.mocked(updater.fetchPublishedVersion).mockReset().mockResolvedValue('0.0.63');
  vi.mocked((await import('@shared/api/notifications')).notify).mockReset().mockResolvedValue(undefined);
});
afterEach(() => { worker.stopUpdateCheckWorker(); vi.useRealTimers(); });

it('checks and installs immediately when enabled even after a recent daily check', async () => {
  const { STORAGE_KEYS } = await import('@shared/lib/storage-keys');
  localStorage.setItem(STORAGE_KEYS.updateCheck, JSON.stringify({ lastCheckAt: Date.now(), lastNotifiedVersion: '0.0.63' }));
  worker.startUpdateCheckWorker();
  settings.patchSettings({ autoUpdate: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
});

it('does not force update checks for unrelated settings', async () => {
  worker.startUpdateCheckWorker();
  settings.patchSettings({ notificationVolume: 20 });
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.fetchPublishedVersion).not.toHaveBeenCalled();
});

it('remembers enabled auto-update at the next startup', async () => {
  settings.patchSettings({ autoUpdate: true });
  worker.startUpdateCheckWorker();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(settings.readSettings().autoUpdate).toBe(true);
  expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
});

it('only notifies when auto-update is disabled', async () => {
  worker.startUpdateCheckWorker();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(updater.checkForUpdate).not.toHaveBeenCalled();
  expect((await import('@shared/api/notifications')).notify).toHaveBeenCalledTimes(1);
});

it('does not install if switched off while the manifest is loading', async () => {
  let release!: (version: string) => void;
  vi.mocked(updater.fetchPublishedVersion).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  settings.patchSettings({ autoUpdate: true });
  worker.startUpdateCheckWorker();
  await vi.advanceTimersByTimeAsync(30_000);
  settings.patchSettings({ autoUpdate: false });
  release('0.0.63');
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.checkForUpdate).not.toHaveBeenCalled();
  expect(settings.readSettings().autoUpdate).toBe(false);
});

it('uses an in-flight manifest check when auto-update is enabled, without installing twice', async () => {
  let release!: (version: string) => void;
  vi.mocked(updater.fetchPublishedVersion).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  worker.startUpdateCheckWorker();
  await vi.advanceTimersByTimeAsync(30_000);
  settings.patchSettings({ autoUpdate: true });
  release('0.0.63');
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
  expect(updater.fetchPublishedVersion).toHaveBeenCalledTimes(1);
});

it('does not lose enablement while a previous notification is pending', async () => {
  const { notify } = await import('@shared/api/notifications');
  let release!: () => void;
  vi.mocked(notify).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  worker.startUpdateCheckWorker();
  await vi.advanceTimersByTimeAsync(30_000);
  settings.patchSettings({ autoUpdate: true });
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
});

it('reports failed installs and retries on focus after a cooldown instead of waiting a day', async () => {
  const { NORDLY_EVENTS } = await import('@shared/lib/custom-events');
  const { STORAGE_KEYS } = await import('@shared/lib/storage-keys');
  const events: unknown[] = [];
  const record = (event: Event) => events.push((event as CustomEvent).detail);
  window.addEventListener(NORDLY_EVENTS.updateAvailable, record);
  try {
    vi.mocked(updater.checkForUpdate).mockResolvedValueOnce({ kind: 'error', code: 'network', message: 'Network connection failed' });
    worker.startUpdateCheckWorker();
    settings.patchSettings({ autoUpdate: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(events).toContainEqual({ error: { kind: 'error', code: 'network', message: 'Network connection failed' } });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.updateCheck)!)).toMatchObject({ lastCheckAt: 0 });
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(updater.checkForUpdate).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    expect(updater.checkForUpdate).toHaveBeenCalledTimes(2);
  } finally { window.removeEventListener(NORDLY_EVENTS.updateAvailable, record); }
});

it('ignores a manifest response after the worker is stopped', async () => {
  let release!: (version: string) => void;
  vi.mocked(updater.fetchPublishedVersion).mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
  settings.patchSettings({ autoUpdate: true });
  worker.startUpdateCheckWorker();
  await vi.advanceTimersByTimeAsync(30_000);
  worker.stopUpdateCheckWorker();
  release('0.0.63');
  await vi.advanceTimersByTimeAsync(0);
  expect(updater.checkForUpdate).not.toHaveBeenCalled();
});
