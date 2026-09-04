import { describe, expect, it, vi } from 'vitest';

vi.mock('@features/calendar/api/calendarClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@features/calendar/api/calendarClient')>();
  return {
    ...actual,
    updateGoogleCalendarEvent: vi.fn(),
  };
});
vi.mock('@features/calendar/lib/googleCalendarSyncWorker', () => ({
  refreshGoogleCalendarCache: vi.fn(),
}));
vi.mock('@shared/lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/lib/dates')>();
  return {
    ...actual,
    snapMinutes: (minutes: number, step = 30) => Math.round(minutes / step) * step,
  };
});

import type { GoogleCalendarEvent } from '@features/calendar/api/calendarClient';
import type { CalendarEntry } from '@features/calendar/lib/events';

import {
  moveCalendarEntry,
  type CalendarEntryDragDependencies,
} from '../useCalendarEntryDrag';

function dependencies(): CalendarEntryDragDependencies {
  const event: GoogleCalendarEvent = {
    id: 'event-1',
    title: 'Review',
    start: '2026-07-15T09:00:00.000Z',
    end: '2026-07-15T10:00:00.000Z',
    allDay: false,
    calendarId: 'primary',
    htmlLink: '',
    editable: true,
  };
  return {
    scheduleTask: vi.fn(async () => undefined),
    updateGoogleEvent: vi.fn(async () => event),
    refreshGoogleCache: vi.fn(async () => undefined),
  };
}

describe('moveCalendarEntry', () => {
  it('moves editable Google entries and preserves their duration', async () => {
    const deps = dependencies();
    const entry: CalendarEntry = {
      id: 'google:event-1',
      source: 'google',
      title: 'Review',
      start: new Date(2026, 6, 15, 9, 0),
      end: new Date(2026, 6, 15, 10, 15),
      allDay: false,
      googleEventId: 'event-1',
      googleCalendarId: 'calendar-1',
      googleEditable: true,
    };

    // Grid starts at 06:00 — 9:00 sits 3 hours down.
    const result = await moveCalendarEntry(entry, 3 * 60, 60, deps, '2026-07-15');

    expect(result).toBe('google');
    expect(deps.updateGoogleEvent).toHaveBeenCalledWith(
      'event-1',
      expect.objectContaining({
        start: new Date(2026, 6, 15, 9, 0),
        end: new Date(2026, 6, 15, 10, 15),
        calendarId: 'calendar-1',
      }),
    );
    expect(deps.refreshGoogleCache).toHaveBeenCalledOnce();
  });

  it('keeps overnight spill on the column dayKey, not entry.start calendar day', async () => {
    const deps = dependencies();
    // Friday 01:00 painted on Thursday's overnight spill.
    const entry: CalendarEntry = {
      id: 'task:t1',
      source: 'task',
      title: 'Late',
      start: new Date(2026, 6, 31, 1, 0),
      end: new Date(2026, 6, 31, 1, 30),
      allDay: false,
      taskId: 't1',
    };
    // Drop at Thursday 22:00 (16h after 06:00).
    await moveCalendarEntry(entry, 16 * 60, 60, deps, '2026-07-30');

    expect(deps.scheduleTask).toHaveBeenCalledWith(
      't1',
      new Date(2026, 6, 30, 22, 0),
      30,
    );
  });

  it('does not mutate read-only Google entries', async () => {
    const deps = dependencies();
    const entry: CalendarEntry = {
      id: 'google:event-1',
      source: 'google',
      title: 'Review',
      start: new Date(2026, 6, 15, 9, 0),
      end: new Date(2026, 6, 15, 10, 0),
      allDay: false,
      googleEventId: 'event-1',
      googleEditable: false,
    };

    await expect(moveCalendarEntry(entry, 180, 60, deps, '2026-07-15')).resolves.toBeNull();
    expect(deps.updateGoogleEvent).not.toHaveBeenCalled();
  });

  it('rejects editable Google entries that are missing calendarId', async () => {
    const deps = dependencies();
    const entry: CalendarEntry = {
      id: 'google:event-1',
      source: 'google',
      title: 'Review',
      start: new Date(2026, 6, 15, 9, 0),
      end: new Date(2026, 6, 15, 10, 0),
      allDay: false,
      googleEventId: 'event-1',
      googleEditable: true,
    };

    await expect(moveCalendarEntry(entry, 180, 60, deps, '2026-07-15')).rejects.toThrow(
      'Google event is missing calendarId',
    );
    expect(deps.updateGoogleEvent).not.toHaveBeenCalled();
  });
});
