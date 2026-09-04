import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelDeferredVaultWatchReload,
  deferVaultWatchReload,
  remapVaultPath,
  suppressVaultWatch,
} from '../vaultOutbox';

afterEach(() => {
  cancelDeferredVaultWatchReload();
  vi.useRealTimers();
});

describe('remapVaultPath', () => {
  it('remaps folder itself and children', () => {
    expect(remapVaultPath('a', 'a', 'b')).toBe('b');
    expect(remapVaultPath('a/x.md', 'a', 'b')).toBe('b/x.md');
    expect(remapVaultPath('a/nested/y.md', 'a', 'proj/a')).toBe('proj/a/nested/y.md');
  });

  it('leaves unrelated paths alone', () => {
    expect(remapVaultPath('other.md', 'a', 'b')).toBe('other.md');
    expect(remapVaultPath('ab/x.md', 'a', 'b')).toBe('ab/x.md');
  });

  it('does not glue child names when prefixes have trailing slashes', () => {
    expect(remapVaultPath('a/x.md', 'a/', 'b')).toBe('b/x.md');
    expect(remapVaultPath('a/x.md', 'a/', 'b/')).toBe('b/x.md');
    expect(remapVaultPath('a', 'a/', 'b')).toBe('b');
  });
});

describe('deferred vault watch reload', () => {
  it('cancels pending callbacks when the watcher unmounts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const reload = vi.fn();
    suppressVaultWatch(100);
    deferVaultWatchReload(reload);

    cancelDeferredVaultWatchReload();
    vi.advanceTimersByTime(1_000);

    expect(reload).not.toHaveBeenCalled();
  });
});
