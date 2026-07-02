import { API_BASE_URL } from '@shared/api/config';
import {
  jsonBoolTrue,
  optionalJsonString,
  requireJsonString,
} from '@shared/api/json';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';

const EVENTS_BASE = `${API_BASE_URL}/v1/tracker/integrations/google/events`;
const SETTINGS_BASE = `${API_BASE_URL}/v1/tracker/settings`;
const GOOGLE_URL_BASE = `${API_BASE_URL}/v1/tracker/integrations/google`;

function jsonHeaders(): Record<string, string> {
  return syncAuthHeaders({ 'content-type': 'application/json' });
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
  const body = (await resp.clone().json()) as { message?: string; error?: string };
  if (typeof body.message === 'string' && body.message) return body.message;
  if (typeof body.error === 'string' && body.error) return body.error;
  return resp.statusText;
}

async function throwForStatus(resp: Response, label: string): Promise<never> {
  let msg = '';
  try {
    msg = await readError(resp);
  } catch {
    msg = resp.statusText;
  }
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
  allDay?: boolean;
  calendarId?: string;
}

function eventTimeIso(raw: unknown, field: string): string {
  if (typeof raw === 'string' && raw.length > 0) return raw;
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if (typeof o.dateTime === 'string' && o.dateTime.length > 0) return o.dateTime;
    if (typeof o.date === 'string' && o.date.length > 0) return o.date;
    const sec = o.seconds;
    if (typeof sec === 'number' && Number.isFinite(sec)) {
      return new Date(sec * 1000).toISOString();
    }
  }
  throw new Error(`Invalid calendar event response: missing ${field}`);
}

function unwrapGoogleEvent(raw: Record<string, unknown>): GoogleCalendarEvent {
  return {
    id: requireJsonString(raw, 'id'),
    title: requireJsonString(raw, 'title'),
    start: eventTimeIso(raw.start, 'start'),
    end: eventTimeIso(raw.end, 'end'),
    allDay: jsonBoolTrue(raw, 'allDay'),
    calendarId: requireJsonString(raw, 'calendarId'),
    htmlLink: optionalJsonString(raw, 'htmlLink') ?? '',
    editable: raw.editable !== false,
  };
}

function unwrapSettings(raw: Record<string, unknown>): TrackerSettings {
  return {
    googleCalendarSyncEnabled: jsonBoolTrue(raw, 'googleCalendarSyncEnabled'),
    googleCalendarConnected: jsonBoolTrue(raw, 'googleCalendarConnected'),
    googleReauthRequired: jsonBoolTrue(raw, 'googleReauthRequired'),
    googleCalendarId: requireJsonString(raw, 'googleCalendarId'),
    zoomConnected: jsonBoolTrue(raw, 'zoomConnected'),
    zoomReauthRequired: jsonBoolTrue(raw, 'zoomReauthRequired'),
  };
}

function unwrapCalendar(raw: Record<string, unknown>): GoogleCalendarListEntry {
  return {
    id: requireJsonString(raw, 'id'),
    summary: requireJsonString(raw, 'summary'),
    primary: jsonBoolTrue(raw, 'primary'),
    writable: jsonBoolTrue(raw, 'writable'),
    backgroundColor: requireJsonString(raw, 'backgroundColor'),
  };
}

function eventBody(input: GoogleEventInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: input.title,
    start: input.start.toISOString(),
    end: input.end.toISOString(),
    allDay: input.allDay ?? false,
  };
  if (input.calendarId) body.calendarId = input.calendarId;
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
  const resp = await apiFetch(`${EVENTS_BASE}?${params}`, { headers: syncAuthHeaders() });
  if (!resp.ok) await throwForStatus(resp, 'listGoogleCalendarEvents');
  const j = (await resp.json()) as { events?: Record<string, unknown>[] };
  if (!Array.isArray(j.events)) throw new Error('Invalid calendar response: missing events');
  return j.events.map(unwrapGoogleEvent);
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
  if (!j.event) throw new Error('Invalid calendar response: missing event');
  return unwrapGoogleEvent(j.event);
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
  if (!j.event) throw new Error('Invalid calendar response: missing event');
  return unwrapGoogleEvent(j.event);
}

export async function deleteGoogleCalendarEvent(
  eventId: string,
  calendarId?: string,
): Promise<void> {
  const params = calendarId ? `?calendar_id=${encodeURIComponent(calendarId)}` : '';
  const resp = await apiFetch(`${EVENTS_BASE}/${encodeURIComponent(eventId)}${params}`, {
    method: 'DELETE',
    headers: syncAuthHeaders(),
  });
  if (!resp.ok) await throwForStatus(resp, 'deleteGoogleCalendarEvent');
}

export async function listGoogleCalendars(): Promise<GoogleCalendarListEntry[]> {
  const resp = await apiFetch(`${GOOGLE_URL_BASE}/calendars`, { headers: syncAuthHeaders() });
  if (!resp.ok) await throwForStatus(resp, 'listGoogleCalendars');
  const j = (await resp.json()) as { calendars?: Record<string, unknown>[] };
  if (!Array.isArray(j.calendars)) throw new Error('Invalid calendar response: missing calendars');
  return j.calendars.map(unwrapCalendar);
}

export async function getTrackerSettings(): Promise<TrackerSettings> {
  const resp = await apiFetch(SETTINGS_BASE, { headers: syncAuthHeaders() });
  if (!resp.ok) await throwForStatus(resp, 'getTrackerSettings');
  const j = (await resp.json()) as { settings?: Record<string, unknown> };
  if (!j.settings) throw new Error('Invalid tracker settings response: missing settings');
  return unwrapSettings(j.settings);
}

export async function updateTrackerSettings(
  patch: Partial<Pick<TrackerSettings, 'googleCalendarSyncEnabled' | 'googleCalendarId'>>,
): Promise<TrackerSettings> {
  const body: Record<string, unknown> = {};
  if (patch.googleCalendarSyncEnabled !== undefined) {
    body.googleCalendarSyncEnabled = patch.googleCalendarSyncEnabled;
  }
  if (patch.googleCalendarId !== undefined) {
    body.googleCalendarId = patch.googleCalendarId;
  }
  const resp = await apiFetch(SETTINGS_BASE, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`updateTrackerSettings: ${resp.status}`);
  const j = (await resp.json()) as { settings?: Record<string, unknown> };
  if (!j.settings) throw new Error('Invalid tracker settings response: missing settings');
  return unwrapSettings(j.settings);
}

export async function getGoogleCalendarAuthURL(): Promise<string> {
  const resp = await apiFetch(`${GOOGLE_URL_BASE}/url`, { headers: syncAuthHeaders() });
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
  if (!j.settings) throw new Error('Invalid tracker settings response: missing settings');
  return unwrapSettings(j.settings);
}

const ZOOM_URL_BASE = `${API_BASE_URL}/v1/tracker/integrations/zoom`;

export async function getZoomAuthURL(): Promise<string> {
  const resp = await apiFetch(`${ZOOM_URL_BASE}/url`, { headers: syncAuthHeaders() });
  if (!resp.ok) throw new Error(`getZoomAuthURL: ${resp.status}`);
  const j = (await resp.json()) as { url?: string };
  if (!j.url) throw new Error('getZoomAuthURL: empty url');
  return j.url;
}

export async function disconnectZoom(): Promise<TrackerSettings> {
  const resp = await apiFetch(`${ZOOM_URL_BASE}/disconnect`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: '{}',
  });
  if (!resp.ok) throw new Error(`disconnectZoom: ${resp.status}`);
  const j = (await resp.json()) as { settings?: Record<string, unknown> };
  if (!j.settings) throw new Error('Invalid tracker settings response: missing settings');
  return unwrapSettings(j.settings);
}

export function openExternalUrl(url: string): void {
  if (typeof window !== 'undefined' && window.nordly?.shell?.openExternal) {
    void window.nordly.shell.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
