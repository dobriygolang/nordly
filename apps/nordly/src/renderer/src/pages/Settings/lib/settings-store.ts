import { PREFS_KEYS, clampInt } from '@shared/model/prefs';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';

export type TextScale = 'normal' | 'large' | 'xlarge';

/** How often the desktop app refetches Google events in the background. */
export const GOOGLE_CALENDAR_POLL_MINUTES = [1, 5, 15, 30] as const;
export type GoogleCalendarPollMinutes = (typeof GOOGLE_CALENDAR_POLL_MINUTES)[number];

export interface NordlySettings {
  pomodoroMinutes: number;
  notifications: boolean;
  textScale: TextScale;
  boardCanvas: BoardCanvasTheme;
  googleCalendarPollMinutes: GoogleCalendarPollMinutes;
}

export const SETTINGS_KEY = PREFS_KEYS.SETTINGS_KEY;
export const THEME_KEY = PREFS_KEYS.THEME_KEY;

export const TEXT_SCALES: TextScale[] = ['normal', 'large', 'xlarge'];

export const DEFAULTS: NordlySettings = {
  pomodoroMinutes: 25,
  notifications: true,
  textScale: 'normal',
  boardCanvas: 'dark',
  googleCalendarPollMinutes: 5,
};

function parseTextScale(v: unknown): TextScale {
  if (v === 'large' || v === 'xlarge') return v;
  return 'normal';
}

function parseBoardCanvas(v: unknown): BoardCanvasTheme {
  return v === 'light' ? 'light' : 'dark';
}

function parsePollMinutes(v: unknown): GoogleCalendarPollMinutes {
  const n = typeof v === 'number' ? v : Number(v);
  if (GOOGLE_CALENDAR_POLL_MINUTES.includes(n as GoogleCalendarPollMinutes)) {
    return n as GoogleCalendarPollMinutes;
  }
  return DEFAULTS.googleCalendarPollMinutes;
}

export function readSettings(): NordlySettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      pomodoroMinutes: clampInt(parsed?.pomodoroMinutes, 5, 90, DEFAULTS.pomodoroMinutes),
      notifications: typeof parsed?.notifications === 'boolean' ? parsed.notifications : DEFAULTS.notifications,
      textScale: parseTextScale(parsed?.textScale),
      boardCanvas: parseBoardCanvas(parsed?.boardCanvas),
      googleCalendarPollMinutes: parsePollMinutes(parsed?.googleCalendarPollMinutes),
    };
  } catch {
    return DEFAULTS;
  }
}

export function persistSettings(next: NordlySettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(NORDLY_EVENTS.settingsChanged));
  } catch {
    /* ignore */
  }
}

export function patchSettings(patch: Partial<NordlySettings>): NordlySettings {
  const next = { ...readSettings(), ...patch };
  persistSettings(next);
  return next;
}

export function googleCalendarPollIntervalMs(): number {
  return readSettings().googleCalendarPollMinutes * 60_000;
}

export { clampInt };

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
      return 'nordly.theme.launch';
  }
}
