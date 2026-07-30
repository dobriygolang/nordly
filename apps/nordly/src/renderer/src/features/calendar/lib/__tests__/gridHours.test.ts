import { describe, expect, it } from 'vitest';

import {
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  dateFromGridMinutes,
  gridMinutesFromDate,
  isTimedOnDayGrid,
} from '../events';
import { resolveScheduleStart, toDayKey } from '@shared/lib/dates';

describe('calendar grid overnight', () => {
  it('maps grid minutes past midnight onto the next calendar day', () => {
    const start = dateFromGridMinutes('2026-07-30', 22 * 60 + 30);
    expect(toDayKey(start)).toBe('2026-07-30');
    expect(start.getHours()).toBe(22);
    expect(start.getMinutes()).toBe(30);

    const overnight = dateFromGridMinutes('2026-07-30', 25 * 60 + 30);
    expect(toDayKey(overnight)).toBe('2026-07-31');
    expect(overnight.getHours()).toBe(1);
    expect(overnight.getMinutes()).toBe(30);

    expect(gridMinutesFromDate('2026-07-30', overnight)).toBe(25 * 60 + 30);
    expect(isTimedOnDayGrid(overnight, '2026-07-30')).toBe(true);
    expect(isTimedOnDayGrid(overnight, '2026-07-31')).toBe(false);
  });

  it('exposes labels through 1 AM (exclusive end at 2 AM)', () => {
    expect(CALENDAR_GRID_START_HOUR).toBe(6);
    expect(CALENDAR_GRID_END_HOUR).toBe(26);
  });
});

describe('resolveScheduleStart', () => {
  it('does not nudge a late-evening start onto the next day', () => {
    const dayKey = '2026-07-30';
    const preferred = dateFromGridMinutes(dayKey, 22 * 60 + 30);
    const blocking = Array.from({ length: 20 }, (_, i) => {
      const start = dateFromGridMinutes(dayKey, (10 + i) * 60);
      return {
        id: `t${i}`,
        scheduledStart: start.toISOString(),
        scheduledDurationMin: 60,
      };
    });
    const resolved = resolveScheduleStart(dayKey, blocking, preferred);
    expect(toDayKey(resolved)).toBe(dayKey);
    expect(resolved.getHours()).toBe(22);
    expect(resolved.getMinutes()).toBe(30);
  });
});
