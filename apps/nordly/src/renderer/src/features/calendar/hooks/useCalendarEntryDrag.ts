import { useCallback } from 'react';

import { updateGoogleCalendarEvent, type GoogleCalendarEvent, type GoogleEventInput } from '@features/calendar/api/calendarClient';
import {
  CALENDAR_GRID_START_HOUR,
  CALENDAR_TIME_SNAP_MIN,
  dateFromGridMinutes,
  type CalendarEntry,
} from '@features/calendar/lib/events';
import { refreshGoogleCalendarCache } from '@features/calendar/lib/googleCalendarSyncWorker';
import {
  CalendarEntrySource,
  type MutableCalendarEntrySource,
} from '@features/calendar/model/entry';
import { scheduleTask } from '@features/tasks/api/tasks';
import { snapMinutes } from '@shared/lib/dates';

export interface CalendarEntryDragDependencies {
  scheduleTask: (taskId: string, start: Date, durationMin: number) => Promise<unknown>;
  updateGoogleEvent: (
    eventId: string,
    input: GoogleEventInput,
  ) => Promise<GoogleCalendarEvent>;
  refreshGoogleCache: () => Promise<unknown>;
}

/**
 * Commit a vertical drag on a week/day column.
 * `gridDayKey` must be the column the block was dragged in (overnight spill
 * lives on the previous calendar day — never derive day from entry.start alone).
 */
export async function moveCalendarEntry(
  entry: CalendarEntry,
  finalTop: number,
  hourHeight: number,
  dependencies: CalendarEntryDragDependencies,
  gridDayKey: string,
): Promise<MutableCalendarEntrySource | null> {
  const startHour = finalTop / hourHeight + CALENDAR_GRID_START_HOUR;
  const minutes = snapMinutes(startHour * 60, CALENDAR_TIME_SNAP_MIN);
  const start = dateFromGridMinutes(gridDayKey, minutes);
  const durationMin = Math.max(
    15,
    Math.round((entry.end.getTime() - entry.start.getTime()) / 60_000),
  );

  if (entry.source === CalendarEntrySource.Task && entry.taskId) {
    await dependencies.scheduleTask(entry.taskId, start, durationMin);
    return CalendarEntrySource.Task;
  }
  if (
    entry.source !== CalendarEntrySource.Google ||
    !entry.googleEventId ||
    !entry.googleEditable
  ) {
    return null;
  }
  if (!entry.googleCalendarId) {
    throw new Error('Google event is missing calendarId');
  }

  await dependencies.updateGoogleEvent(entry.googleEventId, {
    title: entry.title,
    start,
    end: new Date(start.getTime() + durationMin * 60_000),
    allDay: false,
    calendarId: entry.googleCalendarId,
  });
  await dependencies.refreshGoogleCache();
  return CalendarEntrySource.Google;
}

export function useCalendarEntryDrag(
  hourHeight: number,
  onError: (error: unknown) => void,
  onGoogleError: (error: unknown) => void,
): (entry: CalendarEntry, finalTop: number, gridDayKey: string) => Promise<void> {
  return useCallback(
    async (entry, finalTop, gridDayKey) => {
      try {
        await moveCalendarEntry(entry, finalTop, hourHeight, {
          scheduleTask,
          updateGoogleEvent: updateGoogleCalendarEvent,
          refreshGoogleCache: refreshGoogleCalendarCache,
        }, gridDayKey);
      } catch (error) {
        if (entry.source === CalendarEntrySource.Google) onGoogleError(error);
        else onError(error);
      }
    },
    [hourHeight, onError, onGoogleError],
  );
}
