import { useCallback } from 'react';

import {
  CALENDAR_GRID_START_HOUR,
  refreshGoogleCalendarCache,
  updateGoogleCalendarEvent,
  type CalendarEntry,
  type GoogleCalendarEvent,
  type GoogleEventInput,
} from '@features/calendar/api/calendar';
import { scheduleTask } from '@features/tasks/api/tasks';
import { snapMinutes } from '@shared/lib/dates';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

export interface CalendarEntryDragDependencies {
  scheduleTask: (taskId: string, start: Date, durationMin: number) => Promise<unknown>;
  updateGoogleEvent: (
    eventId: string,
    input: GoogleEventInput,
  ) => Promise<GoogleCalendarEvent>;
  notifyTasksChanged: () => void;
  refreshGoogleCache: () => Promise<unknown>;
}

export async function moveCalendarEntry(
  entry: CalendarEntry,
  finalTop: number,
  hourHeight: number,
  dependencies: CalendarEntryDragDependencies,
): Promise<'task' | 'google' | null> {
  const startHour = finalTop / hourHeight + CALENDAR_GRID_START_HOUR;
  const minutes = snapMinutes(startHour * 60);
  const start = new Date(entry.start);
  start.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  const durationMin = Math.max(
    15,
    Math.round((entry.end.getTime() - entry.start.getTime()) / 60_000),
  );

  if (entry.source === 'task' && entry.taskId) {
    await dependencies.scheduleTask(entry.taskId, start, durationMin);
    dependencies.notifyTasksChanged();
    return 'task';
  }
  if (entry.source !== 'google' || !entry.googleEventId || !entry.googleEditable) return null;

  await dependencies.updateGoogleEvent(entry.googleEventId, {
    title: entry.title,
    start,
    end: new Date(start.getTime() + durationMin * 60_000),
    allDay: false,
    calendarId: entry.googleCalendarId,
  });
  await dependencies.refreshGoogleCache();
  return 'google';
}

export function useCalendarEntryDrag(
  hourHeight: number,
  onError: (error: unknown) => void,
  onGoogleError: (error: unknown) => void,
): (entry: CalendarEntry, finalTop: number) => Promise<void> {
  return useCallback(
    async (entry, finalTop) => {
      try {
        await moveCalendarEntry(entry, finalTop, hourHeight, {
          scheduleTask,
          updateGoogleEvent: updateGoogleCalendarEvent,
          notifyTasksChanged: () =>
            window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged)),
          refreshGoogleCache: refreshGoogleCalendarCache,
        });
      } catch (error) {
        if (entry.source === 'google') onGoogleError(error);
        else onError(error);
      }
    },
    [hourHeight, onError, onGoogleError],
  );
}
