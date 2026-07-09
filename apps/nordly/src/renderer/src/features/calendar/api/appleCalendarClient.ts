import { invoke } from '@tauri-apps/api/core';

import { isMacOsDesktop } from '@platform/macos';

export interface AppleCalendarListEntry {
  id: string;
  title: string;
}

export interface AppleCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  calendarId?: string;
}

export interface AppleCalendarAuthStatus {
  status: string;
  authorized: boolean;
}

export interface AppleCalendarAccessResult extends AppleCalendarAuthStatus {
  settingsOpened: boolean;
}

export function appleCalendarAvailable(): boolean {
  return isMacOsDesktop();
}

export interface AppleCalendarRuntimeInfo {
  appBundle: boolean;
  bundleId: string;
}

export async function getAppleCalendarRuntimeInfo(): Promise<AppleCalendarRuntimeInfo> {
  return invoke<AppleCalendarRuntimeInfo>('apple_calendar_runtime_info');
}

export async function getAppleCalendarAuthStatus(): Promise<AppleCalendarAuthStatus> {
  return invoke<AppleCalendarAuthStatus>('apple_calendar_auth_status');
}

export async function requestAppleCalendarAccess(): Promise<AppleCalendarAccessResult> {
  return invoke<AppleCalendarAccessResult>('apple_calendar_request_access');
}

export async function openAppleCalendarSettings(): Promise<void> {
  await invoke('apple_calendar_open_settings');
}

export async function listAppleCalendars(): Promise<AppleCalendarListEntry[]> {
  return invoke<AppleCalendarListEntry[]>('apple_calendar_list_calendars');
}

export async function listAppleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  calendarIds?: string[],
): Promise<AppleCalendarEvent[]> {
  return invoke<AppleCalendarEvent[]>('apple_calendar_list_events', {
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    calendarIds: calendarIds && calendarIds.length > 0 ? calendarIds : null,
  });
}
