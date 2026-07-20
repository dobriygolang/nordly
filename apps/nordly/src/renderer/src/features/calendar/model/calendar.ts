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
