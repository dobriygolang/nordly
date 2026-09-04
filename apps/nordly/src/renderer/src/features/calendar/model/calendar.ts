export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId: string;
  htmlLink: string;
  editable: boolean;
}

export interface TrackerSettings {
  googleCalendarConnected: boolean;
  googleReauthRequired: boolean;
  googleCalendarId: string;
  zoomConnected: boolean;
  zoomReauthRequired: boolean;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary: boolean;
  writable: boolean;
  backgroundColor: string;
}

export interface GoogleEventInput {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  calendarId?: string;
}

export function googleEventDisplayDate(value: string, allDay: boolean): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid Google Calendar event date: ${value}`);
  }
  if (!allDay) return parsed;

  // Tracker timestamps encode Google's date-only values at UTC midnight.
  return new Date(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
  );
}

/** Encode a local all-day selection as the UTC date carrier expected by Tracker. */
export function googleEventWireDate(date: Date, allDay: boolean): Date {
  if (!allDay) return date;
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
}
