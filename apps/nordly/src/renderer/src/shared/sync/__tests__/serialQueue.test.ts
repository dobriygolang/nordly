import { describe, expect, it, vi } from 'vitest';

import { SerialSyncQueue } from '@shared/sync/serialQueue';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SerialSyncQueue', () => {
  it('rejects explicit jobs but resolves background jobs from a failed batch', async () => {
    const firstRun = deferred();
    const failure = new Error('sync failed');
    const run = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(firstRun.promise)
      .mockRejectedValueOnce(failure);
    const onBatchError = vi.fn();
    const queue = new SerialSyncQueue({ run, onBatchError });

    const leading = queue.enqueue();
    const background = queue.enqueue();
    const explicit = queue.enqueue({ explicit: true });
    firstRun.resolve();

    await leading;
    await expect(background).resolves.toBeUndefined();
    await expect(explicit).rejects.toBe(failure);
    expect(onBatchError).toHaveBeenCalledWith(failure);
    expect(run).toHaveBeenNthCalledWith(2, {
      explicit: true,
      retry: undefined,
      pushOnly: undefined,
    });
  });

  it('isolates a new generation from an in-flight stopped generation', async () => {
    const oldRun = deferred();
    const newRun = deferred();
    const run = vi
      .fn<() => Promise<void>>()
      .mockReturnValueOnce(oldRun.promise)
      .mockReturnValueOnce(newRun.promise);
    const queue = new SerialSyncQueue({ run, onBatchError: vi.fn() });

    const oldInFlight = queue.enqueue();
    let discardedSettled = false;
    void queue.enqueue().finally(() => {
      discardedSettled = true;
    });

    queue.stopGeneration();
    const current = queue.enqueue({ retry: true });
    expect(run).toHaveBeenCalledTimes(2);

    oldRun.resolve();
    await oldInFlight;
    await flushMicrotasks();
    expect(discardedSettled).toBe(false);

    newRun.resolve();
    await current;
    expect(run).toHaveBeenNthCalledWith(2, { retry: true });
  });
});
