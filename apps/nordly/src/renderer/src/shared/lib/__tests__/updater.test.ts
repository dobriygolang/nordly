import { beforeEach, expect, it, vi } from 'vitest';
import type { Update } from '@tauri-apps/plugin-updater';

vi.mock('@platform/runtime', () => ({ isTauriRuntime: () => true }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: vi.fn(async () => '0.0.62') }));
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn(async () => new Response(JSON.stringify({ version: '0.0.62' }))) }));
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { checkForUpdate } from '../updater';

beforeEach(() => vi.clearAllMocks());
it('shares one install and broadcasts phases to manual and automatic callers', async () => {
  let release!: () => void;
  const downloadAndInstall = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
  vi.mocked(check).mockResolvedValue({ version: '0.0.63', downloadAndInstall, close: vi.fn(async () => undefined) } as unknown as Update);
  const automaticPhase = vi.fn();
  const first = checkForUpdate(automaticPhase);
  await Promise.resolve();
  const manualPhase = vi.fn();
  const second = checkForUpdate(manualPhase);
  expect(check).toHaveBeenCalledTimes(1);
  expect(downloadAndInstall).toHaveBeenCalledTimes(1);
  expect(manualPhase).toHaveBeenCalledWith('downloading');
  release();
  await expect(first).resolves.toEqual({ kind: 'installed', version: '0.0.63' });
  await expect(second).resolves.toEqual({ kind: 'installed', version: '0.0.63' });
  expect(relaunch).toHaveBeenCalledTimes(1);
  expect(automaticPhase).toHaveBeenCalledWith('relaunching');
  expect(manualPhase).toHaveBeenCalledWith('relaunching');
});

it('allows another attempt after a download failure', async () => {
  const downloadAndInstall = vi.fn().mockRejectedValueOnce(new Error('Network connection failed')).mockResolvedValueOnce(undefined);
  vi.mocked(check).mockResolvedValue({ version: '0.0.63', downloadAndInstall, close: vi.fn(async () => undefined) } as unknown as Update);
  await expect(checkForUpdate(vi.fn())).resolves.toMatchObject({ kind: 'error', code: 'network' });
  await expect(checkForUpdate(vi.fn())).resolves.toMatchObject({ kind: 'installed', version: '0.0.63' });
  expect(check).toHaveBeenCalledTimes(2);
});

it('does not start downloading when auto-update is switched off during the native check', async () => {
  let release!: (value: Update) => void;
  vi.mocked(check).mockImplementationOnce(() => new Promise((resolve) => { release = resolve as (value: Update) => void; }));
  const downloadAndInstall = vi.fn();
  let enabled = true;
  const pending = checkForUpdate(vi.fn(), undefined, () => enabled);
  enabled = false;
  release({ version: '0.0.63', downloadAndInstall, close: vi.fn(async () => undefined) } as unknown as Update);
  await expect(pending).resolves.toEqual({ kind: 'cancelled' });
  expect(downloadAndInstall).not.toHaveBeenCalled();
  expect(relaunch).not.toHaveBeenCalled();
});

it('honours an explicit manual install even if automatic updates are switched off', async () => {
  let release!: (value: Update) => void;
  vi.mocked(check).mockImplementationOnce(() => new Promise((resolve) => { release = resolve as (value: Update) => void; }));
  const downloadAndInstall = vi.fn(async () => undefined);
  const automatic = checkForUpdate(vi.fn(), undefined, () => false);
  const manual = checkForUpdate(vi.fn());
  release({ version: '0.0.63', downloadAndInstall, close: vi.fn(async () => undefined) } as unknown as Update);
  await Promise.all([automatic, manual]);
  expect(downloadAndInstall).toHaveBeenCalledTimes(1);
  expect(relaunch).toHaveBeenCalledTimes(1);
});
