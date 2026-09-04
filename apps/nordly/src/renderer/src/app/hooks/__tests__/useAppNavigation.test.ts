import { describe, expect, it, vi } from 'vitest';

import { PageId } from '@shared/model/navigation';

import {
  PAGE_STORAGE_KEY,
  readStoredPage,
  shouldFlushBeforeNavigation,
} from '../useAppNavigation';

describe('readStoredPage', () => {
  it('uses home when navigation has not been stored', () => {
    expect(readStoredPage()).toBe(PageId.Home);
    expect(readStoredPage({ getItem: () => null, setItem: () => undefined })).toBe(PageId.Home);
  });

  it('returns a valid stored page and rejects corrupted state', () => {
    const storage = {
      getItem: (key: string) => (key === PAGE_STORAGE_KEY ? PageId.Notes : null),
      setItem: () => undefined,
    };
    expect(readStoredPage(storage)).toBe(PageId.Notes);
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
    ).toBe(PageId.Home);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('shouldFlushBeforeNavigation', () => {
  it('gates transitions that leave notes or whiteboard', () => {
    expect(shouldFlushBeforeNavigation(PageId.Notes, PageId.Today)).toBe(true);
    expect(shouldFlushBeforeNavigation(PageId.Notes, PageId.Notes)).toBe(false);
    expect(shouldFlushBeforeNavigation(PageId.Whiteboard, PageId.Home)).toBe(true);
    expect(shouldFlushBeforeNavigation(PageId.Whiteboard, PageId.Whiteboard)).toBe(false);
    expect(shouldFlushBeforeNavigation(PageId.Calendar, PageId.Home)).toBe(true);
    expect(shouldFlushBeforeNavigation(PageId.Calendar, PageId.Calendar)).toBe(false);
    expect(shouldFlushBeforeNavigation(PageId.Planning, PageId.Home)).toBe(true);
    expect(shouldFlushBeforeNavigation(PageId.Planning, PageId.Planning)).toBe(false);
    expect(shouldFlushBeforeNavigation(PageId.Home, PageId.Settings)).toBe(false);
  });
});
