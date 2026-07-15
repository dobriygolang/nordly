import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  browserSyncClock,
  STARTUP_DEFER_MS,
  STARTUP_PUSH_DEFER_MS,
  SYNC_DEBOUNCE_MS,
  SyncScheduler,
} from '@shared/sync/scheduler';

describe('SyncScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces scheduled sync requests', () => {
    const enqueueBackground = vi.fn();
    const scheduler = makeScheduler({ enqueueBackground });

    scheduler.schedule();
    vi.advanceTimersByTime(SYNC_DEBOUNCE_MS - 1);
    scheduler.schedule();
    vi.advanceTimersByTime(SYNC_DEBOUNCE_MS - 1);
    expect(enqueueBackground).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(enqueueBackground).toHaveBeenCalledOnce();
    expect(enqueueBackground).toHaveBeenCalledWith(undefined, 'scheduled');
  });

  it('schedules startup push before full sync and ignores startup focus noise', async () => {
    const enqueueBackground = vi.fn();
    const scheduler = makeScheduler({
      enqueueBackground,
      countPending: vi.fn().mockResolvedValue(2),
    });

    scheduler.start();
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(STARTUP_PUSH_DEFER_MS);
    await Promise.resolve();
    expect(enqueueBackground).toHaveBeenCalledWith({ pushOnly: true }, 'startup push');
    expect(enqueueBackground).not.toHaveBeenCalledWith(undefined, 'focus');

    vi.advanceTimersByTime(STARTUP_DEFER_MS - STARTUP_PUSH_DEFER_MS);
    expect(enqueueBackground).toHaveBeenCalledWith(undefined, 'startup');

    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(SYNC_DEBOUNCE_MS);
    expect(enqueueBackground).toHaveBeenCalledWith(undefined, 'focus');
    scheduler.stop();
  });

  it('cancels lifecycle timers when stopped', () => {
    const enqueueBackground = vi.fn();
    const unsubscribe = vi.fn();
    const scheduler = makeScheduler({
      enqueueBackground,
      subscribeVault: vi.fn(() => unsubscribe),
    });

    scheduler.start();
    scheduler.schedule();
    scheduler.stop();
    vi.runAllTimers();

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(enqueueBackground).not.toHaveBeenCalled();
  });
});

function makeScheduler(
  overrides: Partial<ConstructorParameters<typeof SyncScheduler>[0]> = {},
): SyncScheduler {
  return new SyncScheduler({
    clock: browserSyncClock,
    windowTarget: window,
    documentTarget: document,
    isVisible: () => document.visibilityState === 'visible',
    canSchedule: () => true,
    getSyncState: () => ({ pendingCount: 0, status: 'idle' }),
    countPending: vi.fn().mockResolvedValue(0),
    subscribeVault: vi.fn(() => vi.fn()),
    enqueueBackground: vi.fn(),
    flushOnline: vi.fn(),
    onSchedulerError: vi.fn(),
    ...overrides,
  });
}
