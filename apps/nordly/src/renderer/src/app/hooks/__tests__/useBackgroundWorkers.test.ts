import { describe, expect, it, vi } from 'vitest';

import {
  initializeCloudWorkers,
  type CloudWorkerDependencies,
} from '../backgroundWorkerLifecycle';

function dependencies(
  overrides: Partial<CloudWorkerDependencies> = {},
): CloudWorkerDependencies {
  return {
    loadVaultPrefs: vi.fn(async () => undefined),
    isCloudEnabled: vi.fn(() => true),
    isVaultEnabled: vi.fn(() => true),
    hydrateCalendarCache: vi.fn(async () => undefined),
    startWorkers: vi.fn(),
    stopWorkers: vi.fn(),
    ...overrides,
  };
}

describe('initializeCloudWorkers', () => {
  it('hydrates prerequisites before starting workers', async () => {
    const calls: string[] = [];
    const deps = dependencies({
      loadVaultPrefs: vi.fn(async () => {
        calls.push('vault');
      }),
      hydrateCalendarCache: vi.fn(async () => {
        calls.push('calendar');
      }),
      startWorkers: vi.fn(() => {
        calls.push('start');
      }),
    });
    const setVaultGateActive = vi.fn();

    await initializeCloudWorkers({
      userId: 'user-1',
      reauthRequired: false,
      isCancelled: () => false,
      setVaultGateActive,
      dependencies: deps,
    });

    expect(calls).toEqual(['vault', 'calendar', 'start']);
    expect(setVaultGateActive).toHaveBeenCalledWith(true);
  });

  it('does not start workers after cancellation', async () => {
    let release!: () => void;
    let cancelled = false;
    const deps = dependencies({
      hydrateCalendarCache: vi.fn(
        () => new Promise<void>((resolve) => {
          release = resolve;
        }),
      ),
    });

    const pending = initializeCloudWorkers({
      userId: 'user-1',
      reauthRequired: false,
      isCancelled: () => cancelled,
      setVaultGateActive: vi.fn(),
      dependencies: deps,
    });
    await Promise.resolve();
    cancelled = true;
    release();
    await pending;

    expect(deps.startWorkers).not.toHaveBeenCalled();
  });

  it('keeps workers stopped while reauthentication is required', async () => {
    const deps = dependencies();

    await initializeCloudWorkers({
      userId: 'user-1',
      reauthRequired: true,
      isCancelled: () => false,
      setVaultGateActive: vi.fn(),
      dependencies: deps,
    });

    expect(deps.stopWorkers).toHaveBeenCalledOnce();
    expect(deps.hydrateCalendarCache).not.toHaveBeenCalled();
    expect(deps.startWorkers).not.toHaveBeenCalled();
  });
});
