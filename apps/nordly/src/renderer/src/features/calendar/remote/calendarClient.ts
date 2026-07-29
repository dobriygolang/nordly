/**
 * Device-owned Google Calendar + Zoom integrations (PKCE + Keychain).
 * Tracker HTTP paths are unused by the desktop app.
 */
import {
  clearLocalIntegration,
  readLocalTrackerSettings,
  writeIntegrationPrefs,
} from '@shared/integrations/integrationSettings';
import type {
  GoogleCalendarEvent,
  GoogleCalendarListEntry,
  GoogleEventInput,
  TrackerSettings,
} from '../model/calendar';
import * as googleApi from '../local/googleCalendarApi';
import {
  beginGoogleOAuth,
  disconnectGoogleOAuth,
  GoogleNotConnectedError,
  GoogleReauthError,
} from '../local/googleOAuth';
import { beginZoomOAuth, disconnectZoomOAuth } from '../local/zoomOAuth';

export { GoogleNotConnectedError, GoogleReauthError };

export async function listGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
  return googleApi.listGoogleCalendarEvents(timeMin, timeMax);
}

export async function createGoogleCalendarEvent(
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  return googleApi.createGoogleCalendarEvent(input);
}

export async function updateGoogleCalendarEvent(
  eventId: string,
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  return googleApi.updateGoogleCalendarEvent(eventId, input);
}

export async function deleteGoogleCalendarEvent(
  eventId: string,
  calendarId?: string,
): Promise<void> {
  return googleApi.deleteGoogleCalendarEvent(eventId, calendarId);
}

export async function listGoogleCalendars(): Promise<GoogleCalendarListEntry[]> {
  return googleApi.listGoogleCalendars();
}

export async function getTrackerSettings(): Promise<TrackerSettings> {
  return readLocalTrackerSettings();
}

export async function updateTrackerSettings(
  patch: Partial<Pick<TrackerSettings, 'googleCalendarId'>>,
): Promise<TrackerSettings> {
  if (patch.googleCalendarId !== undefined) {
    writeIntegrationPrefs({ googleCalendarId: patch.googleCalendarId });
  }
  return readLocalTrackerSettings();
}

/** Opens the system browser and completes via loopback (Google) or deep link (Zoom). */
export async function getGoogleCalendarAuthURL(): Promise<string> {
  await beginGoogleOAuth();
  // Connect flow already opened the browser; return empty sentinel for callers that openExternal.
  return '';
}

export async function connectGoogleCalendar(): Promise<TrackerSettings> {
  await beginGoogleOAuth();
  return readLocalTrackerSettings();
}

export async function disconnectGoogleCalendar(): Promise<TrackerSettings> {
  await disconnectGoogleOAuth();
  return clearLocalIntegration('google');
}

export async function getZoomAuthURL(): Promise<string> {
  await beginZoomOAuth();
  return '';
}

export async function connectZoom(): Promise<TrackerSettings> {
  await beginZoomOAuth();
  return readLocalTrackerSettings();
}

export async function disconnectZoom(): Promise<TrackerSettings> {
  await disconnectZoomOAuth();
  return clearLocalIntegration('zoom');
}

export function openExternalUrl(url: string): void {
  if (!url) return;
  if (typeof window !== 'undefined' && window.nordly?.shell?.openExternal) {
    void window.nordly.shell.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
