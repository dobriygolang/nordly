import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTaskRolloverLifecycle } from '../taskRolloverLifecycle';

describe('startTaskRolloverLifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs after startup and debounces repeated focus', async () => {
    const run = vi.fn(async () => undefined);
    const stop = startTaskRolloverLifecycle({ run, onError: vi.fn() });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(run).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1_000);
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(1_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);

    stop();
  });

  it('cancels pending work and forwards rollover failures', async () => {
    const failure = new Error('rollover failed');
    const onError = vi.fn();
    const stop = startTaskRolloverLifecycle({
      run: vi.fn(async () => {
        throw failure;
      }),
      onError,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(onError).toHaveBeenCalledWith(failure);

    window.dispatchEvent(new Event('focus'));
    stop();
    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
