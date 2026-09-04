import { describe, expect, it, vi } from 'vitest';

import { createLatestOnlyWriter } from '@shared/lib/latestOnlyWriter';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
} {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createLatestOnlyWriter', () => {
  it('serializes writes and drains an update made during an await', async () => {
    const first = deferred();
    const second = deferred();
    const write = vi
      .fn<(value: string) => Promise<void>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const writer = createLatestOnlyWriter({
      write,
      onSaved: vi.fn(),
      onError: vi.fn(),
    });

    writer.update('first');
    const flush = writer.flush();
    writer.update('latest');
    expect(writer.flush()).toBe(flush);
    expect(write).toHaveBeenCalledTimes(1);

    first.resolve();
    await Promise.resolve();
    expect(write).toHaveBeenNthCalledWith(2, 'latest');

    second.resolve();
    await expect(flush).resolves.toBe(true);
  });

  it('reports a failed write and keeps the latest value for retry', async () => {
    const failure = new Error('disk full');
    const onError = vi.fn();
    const write = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce();
    const writer = createLatestOnlyWriter({
      write,
      onSaved: vi.fn(),
      onError,
    });

    writer.update('latest');
    await expect(writer.flush()).resolves.toBe(false);
    expect(onError).toHaveBeenCalledWith(failure);
    await expect(writer.flush()).resolves.toBe(true);
    expect(write).toHaveBeenLastCalledWith('latest');
  });
});
