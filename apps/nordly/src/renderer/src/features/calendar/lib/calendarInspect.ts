import type { CalendarEntry } from './events';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { scheduleStartISO } from '@shared/lib/dates';

export type CalendarInspectPayload =
  | { source: 'apple'; eventId: string }
  | {
      source: 'google';
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
      source: 'task';
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
  if (entry.source === 'apple' && entry.appleEventId) {
    inspectCalendarPayload({ source: 'apple', eventId: entry.appleEventId });
    return;
  }
  if (entry.source === 'google') {
    inspectCalendarPayload({
      source: 'google',
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
  if (entry.source === 'task' && entry.conferenceUrl) {
    inspectCalendarPayload({
      source: 'task',
      title: entry.title,
      start: scheduleStartISO(entry.start),
      end: scheduleStartISO(entry.end),
      conferenceUrl: entry.conferenceUrl,
      conferenceProvider: entry.conferenceProvider,
      taskId: entry.taskId,
    });
  }
}
