import { describe, expect, it } from 'vitest';

import { DAY_COL_STRIDE } from '@features/tasks/hooks/useInfiniteDayScroll';

import { visibleDayColumnRange, VISIBLE_DAY_COLUMN_BUFFER } from '../visibleDayColumnRange';

describe('visibleDayColumnRange', () => {
  it('returns empty range when there are no columns', () => {
    expect(visibleDayColumnRange(0, 800, 0, DAY_COL_STRIDE)).toEqual({ first: 0, last: -1 });
  });

  it('windows columns around scrollLeft with a buffer', () => {
    const stride = DAY_COL_STRIDE;
    const scrollLeft = 10 * stride;
    const clientWidth = 3 * stride;
    const range = visibleDayColumnRange(scrollLeft, clientWidth, 36, stride);
    expect(range.first).toBe(10 - VISIBLE_DAY_COLUMN_BUFFER);
    expect(range.last).toBe(12 + VISIBLE_DAY_COLUMN_BUFFER);
  });

  it('clamps to the board edges', () => {
    expect(visibleDayColumnRange(0, DAY_COL_STRIDE, 4, DAY_COL_STRIDE)).toEqual({
      first: 0,
      last: 3,
    });
    const end = visibleDayColumnRange(35 * DAY_COL_STRIDE, DAY_COL_STRIDE, 36, DAY_COL_STRIDE);
    expect(end.last).toBe(35);
    expect(end.first).toBe(35 - VISIBLE_DAY_COLUMN_BUFFER);
  });
});
