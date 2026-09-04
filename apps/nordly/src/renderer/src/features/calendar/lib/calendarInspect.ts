import type { CalendarEntry } from './events';
import { CalendarEntrySource } from '../model/entry';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { scheduleStartISO } from '@shared/lib/dates';

export type CalendarInspectPayload =
  | { source: typeof CalendarEntrySource.Apple; eventId: string }
  | {
      source: typeof CalendarEntrySource.Google;
      title: string;
      start: string;
      end: string;
      allDay: boolean;
      htmlLink?: string;
      editable?: boolean;
      eventId?: string;
      calendarId?: string;
    }
  | {
      source: typeof CalendarEntrySource.Task;
      title: string;
      start: string;
      end: string;
      conferenceUrl?: string;
      conferenceProvider?: string;
      taskId?: string;
    };

export function inspectCalendarPayload(payload: CalendarInspectPayload): void {
  window.dispatchEvent(
    new CustomEvent(NORDLY_EVENTS.calendarInspect, { detail: payload }),
  );
}

/** Open the in-app detail sheet for a calendar entry (Apple / Google / meeting-task). */
export function inspectCalendarEntry(entry: CalendarEntry): void {
  if (
    entry.source === CalendarEntrySource.Apple &&
    entry.appleEventId
  ) {
    inspectCalendarPayload({
      source: CalendarEntrySource.Apple,
      eventId: entry.appleEventId,
    });
    return;
  }
  if (entry.source === CalendarEntrySource.Google) {
    inspectCalendarPayload({
      source: CalendarEntrySource.Google,
      title: entry.title,
      start: scheduleStartISO(entry.start),
      end: scheduleStartISO(entry.end),
      allDay: entry.allDay,
      htmlLink: entry.googleHtmlLink,
      editable: entry.googleEditable,
      eventId: entry.googleEventId,
      calendarId: entry.googleCalendarId,
    });
    return;
  }
  if (
    entry.source === CalendarEntrySource.Task &&
    entry.conferenceUrl
  ) {
    inspectCalendarPayload({
      source: CalendarEntrySource.Task,
      title: entry.title,
      start: scheduleStartISO(entry.start),
      end: scheduleStartISO(entry.end),
      conferenceUrl: entry.conferenceUrl,
      conferenceProvider: entry.conferenceProvider,
      taskId: entry.taskId,
    });
  }
}
