import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';

export type TextScale = 'normal' | 'large' | 'xlarge';

/** How often the desktop app refetches Google events in the background. */
export const GOOGLE_CALENDAR_POLL_MINUTES = [1, 5, 15, 30] as const;
export type GoogleCalendarPollMinutes = (typeof GOOGLE_CALENDAR_POLL_MINUTES)[number];

export interface NordlySettings {
  pomodoroMinutes: number;
  notifications: boolean;
  calendarNotifications: boolean;
  dailyGoalMin: number;
  textScale: TextScale;
  boardCanvas: BoardCanvasTheme;
  googleCalendarPollMinutes: GoogleCalendarPollMinutes;
}

export const SETTINGS_KEY = STORAGE_KEYS.settings;
export const THEME_KEY = STORAGE_KEYS.theme;

export function clampInt(v: unknown, lo: number, hi: number, fieldName = 'value'): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`Invalid numeric setting: ${fieldName}`);
  }
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

export const TEXT_SCALES: TextScale[] = ['normal', 'large', 'xlarge'];

export const DEFAULTS: NordlySettings = {
  pomodoroMinutes: 25,
  notifications: true,
  calendarNotifications: true,
  dailyGoalMin: 120,
  textScale: 'normal',
  boardCanvas: 'dark',
  googleCalendarPollMinutes: 5,
};

function parseTextScale(v: unknown): TextScale {
  if (v === 'large' || v === 'xlarge') return v;
  if (v === 'normal') return v;
  throw new Error(`Invalid text scale: ${String(v)}`);
}

function parseBoardCanvas(v: unknown): BoardCanvasTheme {
  if (v === 'light' || v === 'dark') return v;
  throw new Error(`Invalid board canvas theme: ${String(v)}`);
}

function parsePollMinutes(v: unknown): GoogleCalendarPollMinutes {
  const n = typeof v === 'number' ? v : Number(v);
  if (GOOGLE_CALENDAR_POLL_MINUTES.includes(n as GoogleCalendarPollMinutes)) {
    return n as GoogleCalendarPollMinutes;
  }
  throw new Error(`Invalid Google Calendar poll interval: ${String(v)}`);
}

function parseStoredSettings(parsed: Partial<NordlySettings>): { settings: NordlySettings; migrated: boolean } {
  if (typeof parsed.notifications !== 'boolean') throw new Error('Invalid setting: notifications');

  const migrated =
    typeof parsed.calendarNotifications !== 'boolean' ||
    parsed.textScale === undefined ||
    parsed.boardCanvas === undefined ||
    parsed.googleCalendarPollMinutes === undefined;

  const settings: NordlySettings = {
    pomodoroMinutes: clampInt(parsed.pomodoroMinutes, 5, 90, 'pomodoroMinutes'),
    notifications: parsed.notifications,
    calendarNotifications:
      typeof parsed.calendarNotifications === 'boolean'
        ? parsed.calendarNotifications
        : DEFAULTS.calendarNotifications,
    dailyGoalMin: clampInt(parsed.dailyGoalMin, 15, 720, 'dailyGoalMin'),
    textScale: parsed.textScale === undefined ? DEFAULTS.textScale : parseTextScale(parsed.textScale),
    boardCanvas: parsed.boardCanvas === undefined ? DEFAULTS.boardCanvas : parseBoardCanvas(parsed.boardCanvas),
    googleCalendarPollMinutes:
      parsed.googleCalendarPollMinutes === undefined
        ? DEFAULTS.googleCalendarPollMinutes
        : parsePollMinutes(parsed.googleCalendarPollMinutes),
  };

  return { settings, migrated };
}

export function readSettings(): NordlySettings {
  if (typeof window === 'undefined') return DEFAULTS;
  const raw = window.localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULTS;
  const parsed = JSON.parse(raw) as Partial<NordlySettings>;
  const { settings, migrated } = parseStoredSettings(parsed);
  if (migrated) persistSettings(settings);
  return settings;
}

export function persistSettings(next: NordlySettings): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(NORDLY_EVENTS.settingsChanged));
}

export function patchSettings(patch: Partial<NordlySettings>): NordlySettings {
  const next = { ...readSettings(), ...patch };
  persistSettings(next);
  return next;
}

export function googleCalendarPollIntervalMs(): number {
  return readSettings().googleCalendarPollMinutes * 60_000;
}

export function readPomodoroSeconds(): number {
  return readSettings().pomodoroMinutes * 60;
}

export function readDailyGoalMin(): number {
  return readSettings().dailyGoalMin;
}

export function themeLabelKey(id: string): string {
  switch (id) {
    case 'drift':
      return 'nordly.theme.drift';
    case 'visor':
      return 'nordly.theme.visor';
    case 'winter':
      return 'nordly.theme.winter';
    case 'birthday-light':
      return 'nordly.theme.birthday-light';
    case 'particles':
      return 'nordly.theme.particles';
    case 'debris':
      return 'nordly.theme.debris';
    case 'launch':
      return 'nordly.theme.launch';
    default:
      throw new Error(`Unknown theme id: ${id}`);
  }
}
