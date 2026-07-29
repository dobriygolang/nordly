import {
  isGoogleIntegrationAvailable,
  isZoomIntegrationAvailable,
} from '@shared/model/features';
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

function requireGoogleIntegration(): void {
  if (!isGoogleIntegrationAvailable()) {
    throw new Error('Google Calendar is not configured');
  }
}

function requireZoomIntegration(): void {
  if (!isZoomIntegrationAvailable()) {
    throw new Error('Zoom is not configured');
  }
}

export function listGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
  requireGoogleIntegration();
  return remote.listGoogleCalendarEvents(timeMin, timeMax);
}

export function createGoogleCalendarEvent(
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  requireGoogleIntegration();
  return remote.createGoogleCalendarEvent(input);
}

export function updateGoogleCalendarEvent(
  eventId: string,
  input: GoogleEventInput,
): Promise<GoogleCalendarEvent> {
  requireGoogleIntegration();
  return remote.updateGoogleCalendarEvent(eventId, input);
}

export function deleteGoogleCalendarEvent(eventId: string, calendarId?: string): Promise<void> {
  requireGoogleIntegration();
  return remote.deleteGoogleCalendarEvent(eventId, calendarId);
}

export function listGoogleCalendars(): Promise<GoogleCalendarListEntry[]> {
  requireGoogleIntegration();
  return remote.listGoogleCalendars();
}

export function getTrackerSettings(): Promise<TrackerSettings> {
  return remote.getTrackerSettings();
}

export function updateTrackerSettings(
  patch: Partial<Pick<TrackerSettings, 'googleCalendarId'>>,
): Promise<TrackerSettings> {
  requireGoogleIntegration();
  return remote.updateTrackerSettings(patch);
}

export async function getGoogleCalendarAuthURL(): Promise<string> {
  requireGoogleIntegration();
  return remote.getGoogleCalendarAuthURL();
}

export async function connectGoogleCalendar(): Promise<TrackerSettings> {
  requireGoogleIntegration();
  return remote.connectGoogleCalendar();
}

export function disconnectGoogleCalendar(): Promise<TrackerSettings> {
  requireGoogleIntegration();
  return remote.disconnectGoogleCalendar();
}

export async function getZoomAuthURL(): Promise<string> {
  requireZoomIntegration();
  return remote.getZoomAuthURL();
}

export async function connectZoom(): Promise<TrackerSettings> {
  requireZoomIntegration();
  return remote.connectZoom();
}

export function disconnectZoom(): Promise<TrackerSettings> {
  requireZoomIntegration();
  return remote.disconnectZoom();
}

export function openExternalUrl(url: string): void {
  remote.openExternalUrl(url);
}
