import { API_BASE_URL, DEV_BEARER_TOKEN } from '@shared/api/config';
import { apiFetch } from '@shared/api/http';
import { useSessionStore } from '@shared/model/session';

const EVENTS_BASE = `${API_BASE_URL}/v1/tracker/integrations/google/events`;
const SETTINGS_BASE = `${API_BASE_URL}/v1/tracker/settings`;
const GOOGLE_URL_BASE = `${API_BASE_URL}/v1/tracker/integrations/google`;

function authHeaders(): Record<string, string> {
  const token = useSessionStore.getState().accessToken ?? DEV_BEARER_TOKEN;
  return token ? { authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(): Record<string, string> {
  return { ...authHeaders(), 'content-type': 'application/json' };
}

/** Thrown when the stored Google token was revoked and the user must reconnect. */
export class GoogleReauthError extends Error {
  constructor() {
    super('google_reauth_required');
    this.name = 'GoogleReauthError';
  }
}

/** Thrown when Google Calendar is not connected for this account. */
export class GoogleNotConnectedError extends Error {
  constructor() {
    super('google_not_connected');
    this.name = 'GoogleNotConnectedError';
  }
}

async function readError(resp: Response): Promise<string> {
  try {
    const body = (await resp.clone().json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? '';
  } catch {
    try {
      return await resp.clone().text();
    } catch {
      return '';
    }
  }
}

async function throwForStatus(resp: Response, label: string): Promise<never> {
  const msg = await readError(resp);
  if (msg.includes('google_reauth_required')) throw new GoogleReauthError();
  if (msg.includes('google_not_connected')) throw new GoogleNotConnectedError();
  throw new Error(`${label}: ${resp.status}${msg ? ` ${msg}` : ''}`);
}

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
  googleCalendarSyncEnabled: boolean;
  googleCalendarConnected: boolean;
  googleReauthRequired: boolean;
  googleCalendarId: string;
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
  allDay?: boolean;
  calendarId?: string;
}

function pickBool(obj: Record<string, unknown>, camel: string, snake: string): boolean {
  const v = obj[camel] ?? obj[snake];
  return v === true;
}

function pickStr(obj: Record<string, unknown>, camel: string, snake: string): string {
  const v = obj[camel] ?? obj[snake];
  return typeof v === 'string' ? v : '';
}

function unwrapGoogleEvent(raw: Record<string, unknown>): GoogleCalendarEvent {
  const startRaw = raw.start ?? raw.startTime;
  const endRaw = raw.end ?? raw.endTime;
  const asIso = (val: unknown): string =>
    typeof val === 'string'
      ? val
      : val && typeof val === 'object'
        ? pickStr(val as Record<string, unknown>, 'dateTime', 'date_time') ||
          pickStr(val as Record<string, unknown>, 'date', 'date')
        : '';
  return {
    id: pickStr(raw, 'id', 'id'),
    title: pickStr(raw, 'title', 'title') || pickStr(raw, 'summary', 'summary') || '(No title)',
    start: asIso(startRaw),
    end: asIso(endRaw),
    allDay: pickBool(raw, 'allDay', 'all_day'),
    calendarId: pickStr(raw, 'calendarId', 'calendar_id') || 'primary',
    htmlLink: pickStr(raw, 'htmlLink', 'html_link'),
    editable: raw.editable !== false,
  };
}

function unwrapSettings(raw: Record<string, unknown>): TrackerSettings {
  return {
    googleCalendarSyncEnabled: pickBool(raw, 'googleCalendarSyncEnabled', 'google_calendar_sync_enabled'),
    googleCalendarConnected: pickBool(raw, 'googleCalendarConnected', 'google_calendar_connected'),
    googleReauthRequired: pickBool(raw, 'googleReauthRequired', 'google_reauth_required'),
    googleCalendarId: pickStr(raw, 'googleCalendarId', 'google_calendar_id') || 'primary',
  };
}

function unwrapCalendar(raw: Record<string, unknown>): GoogleCalendarListEntry {
  return {
    id: pickStr(raw, 'id', 'id'),
    summary: pickStr(raw, 'summary', 'summary'),
    primary: pickBool(raw, 'primary', 'primary'),
    writable: pickBool(raw, 'writable', 'writable'),
    backgroundColor: pickStr(raw, 'backgroundColor', 'background_color'),
  };
}

function eventBody(input: GoogleEventInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: input.title,
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    all_day: input.allDay ?? false,
  };
  if (input.calendarId) body.calendar_id = input.calendarId;
  return body;
}

export async function listGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    time_min: timeMin.toISOString(),
    time_max: timeMax.toISOString(),
  });
  const resp = await apiFetch(`${EVENTS_BASE}?${params}`, { headers: authHeaders() });
  if (resp.status === 401) return [];
  if (!resp.ok) await throwForStatus(resp, 'listGoogleCalendarEvents');
  const j = (await resp.json()) as { events?: Record<string, unknown>[] };
  return (j.events ?? []).map(unwrapGoogleEvent).filter((e) => e.start);
}

export async function createGoogleCalendarEvent(
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  const resp = await apiFetch(EVENTS_BASE, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(eventBody(input)),
  });
  if (!resp.ok) await throwForStatus(resp, 'createGoogleCalendarEvent');
  const j = (await resp.json()) as { event?: Record<string, unknown> };
  return unwrapGoogleEvent(j.event ?? {});
}

export async function updateGoogleCalendarEvent(
  eventId: string,
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  const resp = await apiFetch(`${EVENTS_BASE}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(eventBody(input)),
  });
  if (!resp.ok) await throwForStatus(resp, 'updateGoogleCalendarEvent');
  const j = (await resp.json()) as { event?: Record<string, unknown> };
  return unwrapGoogleEvent(j.event ?? {});
}

export async function deleteGoogleCalendarEvent(
  eventId: string,
  calendarId?: string,
): Promise<void> {
  const params = calendarId ? `?calendar_id=${encodeURIComponent(calendarId)}` : '';
  const resp = await apiFetch(`${EVENTS_BASE}/${encodeURIComponent(eventId)}${params}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!resp.ok) await throwForStatus(resp, 'deleteGoogleCalendarEvent');
}

export async function listGoogleCalendars(): Promise<GoogleCalendarListEntry[]> {
  const resp = await apiFetch(`${GOOGLE_URL_BASE}/calendars`, { headers: authHeaders() });
  if (!resp.ok) await throwForStatus(resp, 'listGoogleCalendars');
  const j = (await resp.json()) as { calendars?: Record<string, unknown>[] };
  return (j.calendars ?? []).map(unwrapCalendar);
}

export async function getTrackerSettings(): Promise<TrackerSettings> {
  const resp = await apiFetch(SETTINGS_BASE, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`getTrackerSettings: ${resp.status}`);
  const j = (await resp.json()) as { settings?: Record<string, unknown> };
  return unwrapSettings(j.settings ?? {});
}

export async function updateTrackerSettings(
  patch: Partial<Pick<TrackerSettings, 'googleCalendarSyncEnabled' | 'googleCalendarId'>>,
): Promise<TrackerSettings> {
  const body: Record<string, unknown> = {};
  if (patch.googleCalendarSyncEnabled !== undefined) {
    body.google_calendar_sync_enabled = patch.googleCalendarSyncEnabled;
  }
  if (patch.googleCalendarId !== undefined) {
    body.google_calendar_id = patch.googleCalendarId;
  }
  const resp = await apiFetch(SETTINGS_BASE, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`updateTrackerSettings: ${resp.status}`);
  const j = (await resp.json()) as { settings?: Record<string, unknown> };
  return unwrapSettings(j.settings ?? {});
}

export async function getGoogleCalendarAuthURL(): Promise<string> {
  const resp = await apiFetch(`${GOOGLE_URL_BASE}/url`, { headers: authHeaders() });
  if (!resp.ok) throw new Error(`getGoogleCalendarAuthURL: ${resp.status}`);
  const j = (await resp.json()) as { url?: string };
  if (!j.url) throw new Error('getGoogleCalendarAuthURL: empty url');
  return j.url;
}

export async function disconnectGoogleCalendar(): Promise<TrackerSettings> {
  const resp = await apiFetch(`${GOOGLE_URL_BASE}/disconnect`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: '{}',
  });
  if (!resp.ok) throw new Error(`disconnectGoogleCalendar: ${resp.status}`);
  const j = (await resp.json()) as { settings?: Record<string, unknown> };
  return unwrapSettings(j.settings ?? {});
}

export function openExternalUrl(url: string): void {
  if (typeof window !== 'undefined' && window.nordly?.shell?.openExternal) {
    void window.nordly.shell.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
