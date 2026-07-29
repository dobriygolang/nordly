import { describe, expect, it, vi } from 'vitest';

vi.mock('@features/calendar/api/calendar', () => ({
  CALENDAR_GRID_START_HOUR: 6,
  CALENDAR_TIME_SNAP_MIN: 30,
  refreshGoogleCalendarCache: vi.fn(),
  updateGoogleCalendarEvent: vi.fn(),
}));
vi.mock('@shared/lib/dates', () => ({
  snapMinutes: (minutes: number, step = 30) => Math.round(minutes / step) * step,
}));

import type {
  CalendarEntry,
  GoogleCalendarEvent,
} from '@features/calendar/api/calendar';

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
    notifyTasksChanged: vi.fn(),
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
    const result = await moveCalendarEntry(entry, 3 * 60, 60, deps);

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

    await expect(moveCalendarEntry(entry, 180, 60, deps)).resolves.toBeNull();
    expect(deps.updateGoogleEvent).not.toHaveBeenCalled();
  });
});
