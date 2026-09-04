import { describe, expect, it } from 'vitest';

import {
  formatDuration,
  formatDurationShort,
  parseDayKey,
  parseScheduleInstant,
  taskDayKey,
  taskScheduleStart,
  toDayKey,
} from '@shared/lib/dates';

describe('date invariants', () => {
  it('round-trips valid local day keys', () => {
    expect(toDayKey(parseDayKey('2026-08-27'))).toBe('2026-08-27');
  });

  it.each(['', '2026-8-27', '2026-02-30', 'not-a-date'])(
    'rejects malformed day key %s',
    (value) => {
      expect(() => parseDayKey(value)).toThrow('Invalid day key');
    },
  );

  it('surfaces malformed persisted task dates instead of moving tasks to today', () => {
    expect(() => taskDayKey({ createdAt: 'invalid' })).toThrow(
      'Invalid task createdAt',
    );
    expect(() =>
      taskDayKey({ createdAt: new Date().toISOString(), scheduledStart: 'invalid' }),
    ).toThrow('Invalid task schedule');
    expect(() => taskScheduleStart({ scheduledStart: 'invalid' })).toThrow(
      'Invalid task schedule',
    );
  });

  it.each([
    '',
    '2026-02-30T09:00:00',
    '2026-08-27T25:00:00',
    '2026-08-27T09:00:00 trailing',
    '2026-02-30T09:00:00Z',
  ])('rejects malformed schedule instant %s', (value) => {
    expect(() => parseScheduleInstant(value)).toThrow(
      'Invalid schedule instant',
    );
  });

  it('keeps one duration formatter implementation', () => {
    expect(formatDurationShort).toBe(formatDuration);
    expect(formatDurationShort(90)).toBe('1h 30m');
  });
});
