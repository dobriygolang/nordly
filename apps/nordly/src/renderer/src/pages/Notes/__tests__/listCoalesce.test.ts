import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTrailingCoalesce, NOTES_LIST_COALESCE_MS } from '../listCoalesce';

describe('createTrailingCoalesce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('collapses bursts into one trailing call', () => {
    const fn = vi.fn();
    const coalesce = createTrailingCoalesce(fn, NOTES_LIST_COALESCE_MS);

    coalesce.schedule();
    coalesce.schedule();
    coalesce.schedule();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(NOTES_LIST_COALESCE_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('cancel drops a pending call', () => {
    const fn = vi.fn();
    const coalesce = createTrailingCoalesce(fn, NOTES_LIST_COALESCE_MS);
    coalesce.schedule();
    coalesce.cancel();
    vi.advanceTimersByTime(NOTES_LIST_COALESCE_MS);
    expect(fn).not.toHaveBeenCalled();
  });
});
