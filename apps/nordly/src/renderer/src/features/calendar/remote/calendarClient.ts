import { API_BASE_URL } from '@shared/api/config';
import { ApiHttpError } from '@shared/api/errors';
import {
  jsonBoolTrue,
  optionalJsonStringOrEmpty,
  requireJsonString,
} from '@shared/api/json';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { parseScheduleInstant, scheduleStartISO } from '@shared/lib/dates';
import { googleEventWireDate } from '../model/calendar';
import type {
  GoogleCalendarEvent,
  GoogleCalendarListEntry,
  GoogleEventInput,
  TrackerSettings,
} from '../model/calendar';

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
  const body = (await resp.json()) as Record<string, unknown>;
  return requireJsonString(body, 'message');
}

async function throwForStatus(resp: Response, label: string): Promise<never> {
  const message = await readError(resp);
  if (message === 'google_reauth_required') throw new GoogleReauthError();
  if (message === 'google_not_connected') throw new GoogleNotConnectedError();
  throw new ApiHttpError(label, resp.status);
}

function eventTimeIso(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`Invalid calendar event response: missing ${field}`);
  }
  try {
    parseScheduleInstant(raw);
  } catch (cause) {
    throw new Error(`Invalid calendar event response: bad ${field}`, {
      cause,
    });
  }
  return raw;
}

function unwrapGoogleEvent(raw: Record<string, unknown>): GoogleCalendarEvent {
  return {
    id: requireJsonString(raw, 'id'),
    title: requireJsonString(raw, 'title'),
    start: eventTimeIso(raw.start, 'start'),
    end: eventTimeIso(raw.end, 'end'),
    allDay: jsonBoolTrue(raw, 'allDay'),
    calendarId: requireJsonString(raw, 'calendarId'),
    htmlLink: optionalJsonStringOrEmpty(raw, 'htmlLink'),
    editable: jsonBoolTrue(raw, 'editable'),
  };
}

function unwrapSettings(raw: Record<string, unknown>): TrackerSettings {
  return {
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
    start: scheduleStartISO(googleEventWireDate(input.start, input.allDay)),
    end: scheduleStartISO(googleEventWireDate(input.end, input.allDay)),
    allDay: input.allDay,
  };
  if (input.calendarId) body.calendarId = input.calendarId;
  return body;
}

function requireEventCalendarId(calendarId: string | undefined, action: string): string {
  const id = calendarId?.trim();
  if (!id) throw new Error(`${action} requires calendarId`);
  return id;
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
  const body = eventBody(input);
  body.calendarId = requireEventCalendarId(input.calendarId, 'updateGoogleCalendarEvent');
  const resp = await apiFetch(`${EVENTS_BASE}/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  if (!resp.ok) await throwForStatus(resp, 'updateGoogleCalendarEvent');
  const j = (await resp.json()) as { event?: Record<string, unknown> };
  if (!j.event) throw new Error('Invalid calendar response: missing event');
  return unwrapGoogleEvent(j.event);
}

export async function deleteGoogleCalendarEvent(
  eventId: string,
  calendarId: string,
): Promise<void> {
  const exactCalendarId = requireEventCalendarId(calendarId, 'deleteGoogleCalendarEvent');
  const params = `?calendar_id=${encodeURIComponent(exactCalendarId)}`;
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
  patch: Partial<Pick<TrackerSettings, 'googleCalendarId'>>,
): Promise<TrackerSettings> {
  const body: Record<string, unknown> = {};
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
