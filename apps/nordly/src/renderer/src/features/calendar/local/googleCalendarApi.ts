import { vendorFetch } from '@shared/api/http';
import type {
  GoogleCalendarEvent,
  GoogleCalendarListEntry,
  GoogleEventInput,
} from '@features/calendar/model/calendar';
import { readIntegrationPrefs } from '@shared/integrations/integrationSettings';
import { scheduleStartISO } from '@shared/lib/dates';
import {
  GoogleNotConnectedError,
  GoogleReauthError,
  requireGoogleAccessToken,
} from './googleOAuth';

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

async function googleFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const access = await requireGoogleAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${access}`);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const resp = await vendorFetch(`${CALENDAR_API}${path}`, { ...init, headers });
  if (resp.status === 401) throw new GoogleReauthError();
  return resp;
}

async function throwGoogle(resp: Response, label: string): Promise<never> {
  const text = await resp.text();
  if (resp.status === 401 || /invalid_grant|authError/i.test(text)) throw new GoogleReauthError();
  throw new Error(`${label}: ${resp.status} ${text}`);
}

function mapEvent(
  raw: Record<string, unknown>,
  calendarId: string,
): GoogleCalendarEvent {
  const id = typeof raw.id === 'string' ? raw.id : '';
  if (!id) throw new Error('Invalid Google event: missing id');
  const startObj = raw.start as { dateTime?: string; date?: string } | undefined;
  const endObj = raw.end as { dateTime?: string; date?: string } | undefined;
  const allDay = Boolean(startObj?.date && !startObj?.dateTime);
  const start = startObj?.dateTime ?? startObj?.date;
  const end = endObj?.dateTime ?? endObj?.date;
  if (!start || !end) throw new Error(`Invalid Google event ${id}: missing start/end`);
  const accessRole = typeof raw.accessRole === 'string' ? raw.accessRole : '';
  const editable = accessRole === 'writer' || accessRole === 'owner' || accessRole === '';
  return {
    id,
    title: typeof raw.summary === 'string' ? raw.summary : '(No title)',
    start,
    end,
    allDay,
    calendarId,
    htmlLink: typeof raw.htmlLink === 'string' ? raw.htmlLink : '',
    editable,
  };
}

function eventDateTimes(input: GoogleEventInput): {
  start: Record<string, string>;
  end: Record<string, string>;
} {
  if (input.allDay) {
    const startDay = scheduleStartISO(input.start).slice(0, 10);
    const endDay = scheduleStartISO(input.end).slice(0, 10);
    return { start: { date: startDay }, end: { date: endDay } };
  }
  return {
    start: { dateTime: scheduleStartISO(input.start) },
    end: { dateTime: scheduleStartISO(input.end) },
  };
}

function meetUrlFromEvent(raw: Record<string, unknown>): string {
  if (typeof raw.hangoutLink === 'string' && raw.hangoutLink) return raw.hangoutLink;
  const conf = raw.conferenceData as
    | { entryPoints?: Array<{ entryPointType?: string; uri?: string }> }
    | undefined;
  for (const ep of conf?.entryPoints ?? []) {
    if (ep.entryPointType === 'video' && ep.uri) return ep.uri;
  }
  return '';
}

export async function listGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
  const calList = await listGoogleCalendars();
  const out: GoogleCalendarEvent[] = [];
  for (const cal of calList) {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
    });
    const resp = await googleFetch(
      `/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
    );
    if (!resp.ok) await throwGoogle(resp, 'listGoogleCalendarEvents');
    const json = (await resp.json()) as { items?: Record<string, unknown>[] };
    for (const item of json.items ?? []) {
      out.push(mapEvent(item, cal.id));
    }
  }
  return out;
}

export async function listGoogleCalendars(): Promise<GoogleCalendarListEntry[]> {
  const resp = await googleFetch('/users/me/calendarList');
  if (!resp.ok) await throwGoogle(resp, 'listGoogleCalendars');
  const json = (await resp.json()) as { items?: Record<string, unknown>[] };
  if (!Array.isArray(json.items)) throw new Error('Invalid calendarList response');
  return json.items.map((raw) => {
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!id) throw new Error('Invalid calendarList entry: missing id');
    const role = typeof raw.accessRole === 'string' ? raw.accessRole : '';
    return {
      id,
      summary: typeof raw.summary === 'string' ? raw.summary : id,
      primary: raw.primary === true,
      writable: role === 'owner' || role === 'writer',
      backgroundColor:
        typeof raw.backgroundColor === 'string' ? raw.backgroundColor : '#4285f4',
    };
  });
}

function writeCalendarId(input?: string): string {
  return (input?.trim() || readIntegrationPrefs().googleCalendarId || 'primary').trim();
}

export async function createGoogleCalendarEvent(
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  const calendarId = writeCalendarId(input.calendarId);
  const times = eventDateTimes(input);
  const resp = await googleFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify({
      summary: input.title,
      start: times.start,
      end: times.end,
    }),
  });
  if (!resp.ok) await throwGoogle(resp, 'createGoogleCalendarEvent');
  return mapEvent((await resp.json()) as Record<string, unknown>, calendarId);
}

export async function updateGoogleCalendarEvent(
  eventId: string,
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  const calendarId = writeCalendarId(input.calendarId);
  const times = eventDateTimes(input);
  const resp = await googleFetch(
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        summary: input.title,
        start: times.start,
        end: times.end,
      }),
    },
  );
  if (!resp.ok) await throwGoogle(resp, 'updateGoogleCalendarEvent');
  return mapEvent((await resp.json()) as Record<string, unknown>, calendarId);
}

export async function deleteGoogleCalendarEvent(
  eventId: string,
  calendarId?: string,
): Promise<void> {
  const cid = writeCalendarId(calendarId);
  const resp = await googleFetch(
    `/calendars/${encodeURIComponent(cid)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );
  if (resp.status === 404 || resp.status === 410) return;
  if (!resp.ok) await throwGoogle(resp, 'deleteGoogleCalendarEvent');
}

export interface MeetConferenceResult {
  meetUrl: string;
  googleEventId: string;
  calendarId: string;
}

export async function createGoogleMeetForTask(input: {
  title: string;
  start: Date;
  end: Date;
  existingEventId?: string;
}): Promise<MeetConferenceResult> {
  const calendarId = writeCalendarId();
  const times = eventDateTimes({
    title: input.title,
    start: input.start,
    end: input.end,
    allDay: false,
  });
  const conferenceData = {
    createRequest: {
      requestId: crypto.randomUUID(),
      conferenceSolutionKey: { type: 'hangoutsMeet' },
    },
  };
  const path = input.existingEventId
    ? `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(input.existingEventId)}?conferenceDataVersion=1`
    : `/calendars/${encodeURIComponent(calendarId)}/events?conferenceDataVersion=1`;
  const resp = await googleFetch(path, {
    method: input.existingEventId ? 'PATCH' : 'POST',
    body: JSON.stringify({
      summary: input.title,
      start: times.start,
      end: times.end,
      conferenceData,
    }),
  });
  if (!resp.ok) await throwGoogle(resp, 'createGoogleMeetForTask');
  const raw = (await resp.json()) as Record<string, unknown>;
  const meetUrl = meetUrlFromEvent(raw);
  const googleEventId = typeof raw.id === 'string' ? raw.id : '';
  if (!meetUrl || !googleEventId) {
    throw new Error('Google Meet creation returned empty link');
  }
  return { meetUrl, googleEventId, calendarId };
}

export { GoogleNotConnectedError, GoogleReauthError };
