import { isCloudApiAvailable, isCloudEnabled } from '@shared/sync/syncConfig';
import * as remote from '../remote/calendarClient';
import type {
  GoogleCalendarEvent,
  GoogleCalendarListEntry,
  GoogleEventInput,
  TrackerSettings,
} from '../model/calendar';

export type {
  GoogleCalendarEvent,
  GoogleCalendarListEntry,
  GoogleEventInput,
  TrackerSettings,
} from '../model/calendar';

export const GoogleNotConnectedError = remote.GoogleNotConnectedError;
export const GoogleReauthError = remote.GoogleReauthError;

function requireCalendarCloudAccess(): void {
  if (!isCloudEnabled()) {
    throw new Error('Calendar cloud integration is disabled');
  }
  if (!isCloudApiAvailable()) {
    throw new Error('Calendar cloud integration requires a signed-in cloud session');
  }
}

export function listGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
  requireCalendarCloudAccess();
  return remote.listGoogleCalendarEvents(timeMin, timeMax);
}

export function createGoogleCalendarEvent(
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  requireCalendarCloudAccess();
  return remote.createGoogleCalendarEvent(input);
}

export function updateGoogleCalendarEvent(
  eventId: string,
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  requireCalendarCloudAccess();
  return remote.updateGoogleCalendarEvent(eventId, input);
}

export function deleteGoogleCalendarEvent(eventId: string, calendarId: string): Promise<void> {
  requireCalendarCloudAccess();
  return remote.deleteGoogleCalendarEvent(eventId, calendarId);
}

export function listGoogleCalendars(): Promise<GoogleCalendarListEntry[]> {
  requireCalendarCloudAccess();
  return remote.listGoogleCalendars();
}

export async function getTrackerSettings(): Promise<TrackerSettings | null> {
  // Optional integration: when LOCAL_ONLY or no cloud session, callers keep
  // working offline — Google/Zoom UI stays hidden until cloud comes back.
  if (!isCloudEnabled() || !isCloudApiAvailable()) return null;
  return remote.getTrackerSettings();
}

export function updateTrackerSettings(
  patch: Partial<Pick<TrackerSettings, 'googleCalendarId'>>,
): Promise<TrackerSettings> {
  requireCalendarCloudAccess();
  return remote.updateTrackerSettings(patch);
}

export function getGoogleCalendarAuthURL(): Promise<string> {
  requireCalendarCloudAccess();
  return remote.getGoogleCalendarAuthURL();
}

export function disconnectGoogleCalendar(): Promise<TrackerSettings> {
  requireCalendarCloudAccess();
  return remote.disconnectGoogleCalendar();
}

export function getZoomAuthURL(): Promise<string> {
  requireCalendarCloudAccess();
  return remote.getZoomAuthURL();
}

export function disconnectZoom(): Promise<TrackerSettings> {
  requireCalendarCloudAccess();
  return remote.disconnectZoom();
}

export function openExternalUrl(url: string): void {
  remote.openExternalUrl(url);
}
