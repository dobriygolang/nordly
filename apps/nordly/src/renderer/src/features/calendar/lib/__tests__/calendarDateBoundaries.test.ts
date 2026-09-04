import { describe, expect, it } from 'vitest';

import { CalendarEntrySource } from '../../model/entry';
import { googleEventWireDate } from '../../model/calendar';
import {
  allDayEntryOnDay,
  entriesForDay,
  entriesForWeek,
  googleToCalendarEntries,
  hasYearBusyEntry,
  layoutTimedEntriesForDay,
  localDayRange,
  timedEntriesForDay,
  type CalendarEntry,
} from '../events';

function entry(
  id: string,
  source: CalendarEntry['source'],
  start: Date,
  end: Date,
  allDay = false,
): CalendarEntry {
  return { id, source, title: id, start, end, allDay };
}

describe('calendar date boundaries', () => {
  it('assigns next-Monday early hours to the prior week overnight spill', () => {
    const weekStart = new Date(2026, 6, 13);
    const firstMondayEarly = entry(
      'first-monday',
      CalendarEntrySource.Google,
      new Date(2026, 6, 13, 1),
      new Date(2026, 6, 13, 1, 30),
    );
    const nextMondayEarly = entry(
      'next-monday',
      CalendarEntrySource.Google,
      new Date(2026, 6, 20, 1),
      new Date(2026, 6, 20, 1, 30),
    );

    expect(entriesForWeek([firstMondayEarly, nextMondayEarly], weekStart)).toEqual([
      nextMondayEarly,
    ]);
  });

  it('includes timed and all-day entries on every intersected month day', () => {
    const timed = entry(
      'timed',
      CalendarEntrySource.Google,
      new Date(2026, 6, 14, 23),
      new Date(2026, 6, 16, 1),
    );
    const allDay = entry(
      'all-day',
      CalendarEntrySource.Apple,
      new Date(2026, 6, 14),
      new Date(2026, 6, 17),
      true,
    );

    expect(entriesForDay([timed, allDay], '2026-07-15')).toEqual([timed, allDay]);
    expect(allDayEntryOnDay(allDay, '2026-07-16')).toBe(true);
    expect(allDayEntryOnDay(allDay, '2026-07-17')).toBe(false);
  });

  it('clips a multi-day timed event into each intersected week grid', () => {
    const timed = entry(
      'multi-day',
      CalendarEntrySource.Google,
      new Date(2026, 6, 14, 23),
      new Date(2026, 6, 16, 1),
    );
    const middleDayEntries = timedEntriesForDay([timed], '2026-07-15');
    const [layout] = layoutTimedEntriesForDay(
      middleDayEntries,
      40,
      6,
      26,
      '2026-07-15',
    );

    expect(middleDayEntries).toEqual([timed]);
    expect(layout).toMatchObject({ top: 0, height: 760 });
  });

  it('uses local calendar midnights across DST transitions', () => {
    const spring = localDayRange('2026-03-08');
    const fall = localDayRange('2026-11-01');
    expect(spring).toEqual({
      start: new Date(2026, 2, 8).getTime(),
      end: new Date(2026, 2, 9).getTime(),
    });
    expect(fall).toEqual({
      start: new Date(2026, 10, 1).getTime(),
      end: new Date(2026, 10, 2).getTime(),
    });

    if (new Date(2026, 2, 8).getTimezoneOffset() !== new Date(2026, 2, 9).getTimezoneOffset()) {
      expect(spring.end - spring.start).toBe(23 * 60 * 60_000);
    }
    if (new Date(2026, 10, 1).getTimezoneOffset() !== new Date(2026, 10, 2).getTimezoneOffset()) {
      expect(fall.end - fall.start).toBe(25 * 60 * 60_000);
    }
  });

  it('keeps Google all-day date values at local midnight', () => {
    const [allDay] = googleToCalendarEntries(
      [
        {
          id: 'google-all-day',
          title: 'Holiday',
          start: '2026-08-27T00:00:00Z',
          end: '2026-08-28T00:00:00Z',
          allDay: true,
          calendarId: 'primary',
          htmlLink: '',
          editable: false,
        },
      ],
      new Set(),
    );

    expect(allDay?.start).toEqual(new Date(2026, 7, 27));
    expect(allDay?.end).toEqual(new Date(2026, 7, 28));
    expect(
      googleEventWireDate(new Date(2026, 7, 27), true).toISOString(),
    ).toBe('2026-08-27T00:00:00.000Z');
  });

  it('rejects malformed provider event ranges', () => {
    expect(() =>
      googleToCalendarEntries(
        [
          {
            id: 'broken',
            title: 'Broken',
            start: 'not-a-date',
            end: '2026-08-28T00:00:00Z',
            allDay: false,
            calendarId: 'primary',
            htmlLink: '',
            editable: false,
          },
        ],
        new Set(),
      ),
    ).toThrow('Invalid Google Calendar event start');
  });

  it('marks an Apple-only year day as busy', () => {
    const apple = entry(
      'apple',
      CalendarEntrySource.Apple,
      new Date(2026, 8, 4, 10),
      new Date(2026, 8, 4, 11),
    );

    expect(hasYearBusyEntry([apple], '2026-09-04')).toBe(true);
  });
});
