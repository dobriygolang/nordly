import { describe, expect, it, vi } from 'vitest';

import { trackAsyncDisposer } from '../asyncDisposer';

describe('trackAsyncDisposer', () => {
  it('disposes immediately when cleanup wins the setup race', async () => {
    let resolve!: (dispose: () => void) => void;
    const pending = new Promise<() => void>((done) => {
      resolve = done;
    });
    const dispose = vi.fn();
    const onError = vi.fn();
    const cleanup = trackAsyncDisposer(pending, onError);

    cleanup();
    cleanup();
    resolve(dispose);
    await pending;
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('surfaces setup rejection through the required error handler', async () => {
    const failure = new Error('listen failed');
    const onError = vi.fn();
    const pending = Promise.reject<() => void>(failure);

    trackAsyncDisposer(pending, onError);
    await pending.catch(() => undefined);
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(failure);
  });
});
