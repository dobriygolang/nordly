import { describe, expect, it } from 'vitest';

import { calendarQueryRange } from '../calendarQuery';

describe('calendarQueryRange', () => {
  it('pads the active week range for cache prefetching', () => {
    const weekStart = new Date(2026, 6, 13);
    const range = calendarQueryRange({
      viewMode: 'week',
      weekStart,
      monthDate: new Date(2026, 0, 1),
      viewYear: 2026,
    });

    expect(range.start).toEqual(new Date(2026, 6, 6));
    expect(range.end).toEqual(new Date(2026, 6, 27));
  });

  it('uses the complete selected year before padding', () => {
    const range = calendarQueryRange(
      {
        viewMode: 'year',
        weekStart: new Date(2025, 0, 1),
        monthDate: new Date(2025, 0, 1),
        viewYear: 2026,
      },
      0,
    );

    expect(range.start).toEqual(new Date(2026, 0, 1));
    expect(range.end).toEqual(new Date(2027, 0, 1));
  });
});
