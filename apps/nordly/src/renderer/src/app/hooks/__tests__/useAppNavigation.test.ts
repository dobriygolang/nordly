import { describe, expect, it, vi } from 'vitest';

import {
  PAGE_STORAGE_KEY,
  readStoredPage,
  shouldFlushBeforeNavigation,
} from '../useAppNavigation';

describe('readStoredPage', () => {
  it('uses home when navigation has not been stored', () => {
    expect(readStoredPage()).toBe('home');
    expect(readStoredPage({ getItem: () => null, setItem: () => undefined })).toBe('home');
  });

  it('returns a valid stored page and rejects corrupted state', () => {
    const storage = {
      getItem: (key: string) => (key === PAGE_STORAGE_KEY ? 'notes' : null),
      setItem: () => undefined,
    };
    expect(readStoredPage(storage)).toBe('notes');
    expect(() =>
      readStoredPage({ ...storage, getItem: () => 'stats' }),
    ).toThrow('Invalid stored page: stats');
  });

  it('returns home when storage getItem throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(
      readStoredPage({
        getItem: () => {
          throw new Error('quota');
        },
        setItem: () => undefined,
      }),
    ).toBe('home');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('shouldFlushBeforeNavigation', () => {
  it('only gates transitions that leave notes', () => {
    expect(shouldFlushBeforeNavigation('notes', 'today')).toBe(true);
    expect(shouldFlushBeforeNavigation('notes', 'notes')).toBe(false);
    expect(shouldFlushBeforeNavigation('home', 'settings')).toBe(false);
  });
});
