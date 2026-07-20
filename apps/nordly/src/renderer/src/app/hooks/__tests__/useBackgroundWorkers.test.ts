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
  it('hydrates vault and calendar without starting sync workers', async () => {
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
      isCancelled: () => false,
      setVaultGateActive,
      dependencies: deps,
    });

    expect(calls).toEqual(['vault', 'calendar']);
    expect(deps.startWorkers).not.toHaveBeenCalled();
    expect(setVaultGateActive).toHaveBeenCalledWith(true);
  });

  it('does not hydrate calendar after cancellation', async () => {
    let release!: () => void;
    let cancelled = false;
    const deps = dependencies({
      loadVaultPrefs: vi.fn(
        () => new Promise<void>((resolve) => {
          release = resolve;
        }),
      ),
    });

    const pending = initializeCloudWorkers({
      userId: 'user-1',
      isCancelled: () => cancelled,
      setVaultGateActive: vi.fn(),
      dependencies: deps,
    });
    await Promise.resolve();
    cancelled = true;
    release();
    await pending;

    expect(deps.hydrateCalendarCache).not.toHaveBeenCalled();
    expect(deps.startWorkers).not.toHaveBeenCalled();
  });

  it('skips calendar hydrate when cloud is disabled but still gates vault', async () => {
    const deps = dependencies({
      isCloudEnabled: vi.fn(() => false),
      isVaultEnabled: vi.fn(() => true),
    });
    const setVaultGateActive = vi.fn();

    await initializeCloudWorkers({
      userId: 'user-1',
      isCancelled: () => false,
      setVaultGateActive,
      dependencies: deps,
    });

    expect(deps.hydrateCalendarCache).not.toHaveBeenCalled();
    expect(deps.startWorkers).not.toHaveBeenCalled();
    expect(setVaultGateActive).toHaveBeenCalledWith(true);
  });
});
