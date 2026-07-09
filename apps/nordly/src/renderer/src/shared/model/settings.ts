import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';

export type TextScale = 'normal' | 'large' | 'xlarge';

/** Default focus timer mode shown in the dock. Mirrors `FocusTimerMode` in
 * `@shared/model/pomodoro` — declared here (not imported) to avoid a cycle,
 * since pomodoro reads its defaults from this module. */
export type TimerMode = 'pomodoro' | 'stopwatch';

/** How often the desktop app refetches Google events in the background. */
export const GOOGLE_CALENDAR_POLL_MINUTES = [1, 5, 15, 30] as const;
export type GoogleCalendarPollMinutes = (typeof GOOGLE_CALENDAR_POLL_MINUTES)[number];

/** How often the macOS desktop app refetches Apple Calendar events locally. */
export const APPLE_CALENDAR_POLL_MINUTES = GOOGLE_CALENDAR_POLL_MINUTES;
export type AppleCalendarPollMinutes = GoogleCalendarPollMinutes;

export type QuickCaptureShortcutPreset = 'primary' | 'alt_option' | 'alt_space';

export const QUICK_CAPTURE_SHORTCUT_PRESETS: Record<
  QuickCaptureShortcutPreset,
  { mac: string; other: string; labelKey: string }
> = {
  primary: {
    mac: 'Command+Shift+N',
    other: 'Control+Shift+N',
    labelKey: 'nordly.settings.quick_capture.preset_primary',
  },
  alt_option: {
    mac: 'Command+Option+N',
    other: 'Control+Alt+N',
    labelKey: 'nordly.settings.quick_capture.preset_alt_option',
  },
  alt_space: {
    mac: 'Command+Shift+Space',
    other: 'Control+Shift+Space',
    labelKey: 'nordly.settings.quick_capture.preset_alt_space',
  },
};

export interface NordlySettings {
  pomodoroMinutes: number;
  timerMode: TimerMode;
  endBell: boolean;
  notifications: boolean;
  calendarNotifications: boolean;
  autoUpdate: boolean;
  taskRollover: boolean;
  dailyGoalMin: number;
  textScale: TextScale;
  boardCanvas: BoardCanvasTheme;
  googleCalendarPollMinutes: GoogleCalendarPollMinutes;
  /** macOS-only: show Apple Calendar events in the day timeline (read-only). */
  appleCalendarEnabled: boolean;
  /** Empty = all visible calendars. */
  appleCalendarIds: string[];
  appleCalendarPollMinutes: AppleCalendarPollMinutes;
  /** UI preview — show plan meters as if limits are exhausted. */
  planPreviewExhausted: boolean;
  /** OS-level quick note capture (global shortcut). Desktop only. */
  quickCaptureEnabled: boolean;
  /** Tauri global-shortcut string, e.g. Command+Shift+N */
  quickCaptureShortcut: string;
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

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac/i.test(navigator.platform || navigator.userAgent);
}

export function defaultQuickCaptureShortcut(): string {
  const preset = QUICK_CAPTURE_SHORTCUT_PRESETS.primary;
  return isMacPlatform() ? preset.mac : preset.other;
}

export function resolveQuickCaptureShortcut(preset: QuickCaptureShortcutPreset): string {
  const entry = QUICK_CAPTURE_SHORTCUT_PRESETS[preset];
  return isMacPlatform() ? entry.mac : entry.other;
}

export function detectQuickCapturePreset(shortcut: string): QuickCaptureShortcutPreset {
  const normalized = shortcut.trim();
  for (const [id, entry] of Object.entries(QUICK_CAPTURE_SHORTCUT_PRESETS) as Array<
    [QuickCaptureShortcutPreset, (typeof QUICK_CAPTURE_SHORTCUT_PRESETS)[QuickCaptureShortcutPreset]]
  >) {
    if (entry.mac === normalized || entry.other === normalized) return id;
  }
  return 'primary';
}

export const DEFAULTS: NordlySettings = {
  pomodoroMinutes: 25,
  timerMode: 'pomodoro',
  endBell: true,
  notifications: true,
  calendarNotifications: true,
  autoUpdate: false,
  taskRollover: true,
  dailyGoalMin: 120,
  textScale: 'normal',
  boardCanvas: 'dark',
  googleCalendarPollMinutes: 5,
  appleCalendarEnabled: false,
  appleCalendarIds: [],
  appleCalendarPollMinutes: 5,
  planPreviewExhausted: false,
  quickCaptureEnabled: true,
  quickCaptureShortcut: defaultQuickCaptureShortcut(),
};

function parseTimerMode(v: unknown): TimerMode {
  if (v === 'pomodoro' || v === 'stopwatch') return v;
  throw new Error(`Invalid timer mode: ${String(v)}`);
}

function parseTextScale(v: unknown): TextScale {
  if (v === 'large' || v === 'xlarge') return v;
  if (v === 'normal') return v;
  throw new Error(`Invalid text scale: ${String(v)}`);
}

function parseBoardCanvas(v: unknown): BoardCanvasTheme {
  if (v === 'light' || v === 'dark') return v;
  throw new Error(`Invalid board canvas theme: ${String(v)}`);
}

function parseApplePollMinutes(v: unknown): AppleCalendarPollMinutes {
  const n = typeof v === 'number' ? v : Number(v);
  if (APPLE_CALENDAR_POLL_MINUTES.includes(n as AppleCalendarPollMinutes)) {
    return n as AppleCalendarPollMinutes;
  }
  throw new Error(`Invalid Apple Calendar poll interval: ${String(v)}`);
}

function parseCalendarIds(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error('Invalid setting: appleCalendarIds');
  return v.map((id) => {
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error('Invalid setting: appleCalendarIds');
    }
    return id;
  });
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
    parsed.timerMode === undefined ||
    typeof parsed.endBell !== 'boolean' ||
    typeof parsed.taskRollover !== 'boolean' ||
    parsed.textScale === undefined ||
    parsed.boardCanvas === undefined ||
    parsed.googleCalendarPollMinutes === undefined ||
    typeof parsed.autoUpdate !== 'boolean' ||
    typeof parsed.planPreviewExhausted !== 'boolean' ||
    typeof parsed.appleCalendarEnabled !== 'boolean' ||
    parsed.appleCalendarIds === undefined ||
    parsed.appleCalendarPollMinutes === undefined ||
    typeof parsed.quickCaptureEnabled !== 'boolean' ||
    typeof parsed.quickCaptureShortcut !== 'string';

  const settings: NordlySettings = {
    pomodoroMinutes: clampInt(parsed.pomodoroMinutes, 5, 90, 'pomodoroMinutes'),
    timerMode: parsed.timerMode === undefined ? DEFAULTS.timerMode : parseTimerMode(parsed.timerMode),
    endBell: typeof parsed.endBell === 'boolean' ? parsed.endBell : DEFAULTS.endBell,
    notifications: parsed.notifications,
    calendarNotifications:
      typeof parsed.calendarNotifications === 'boolean'
        ? parsed.calendarNotifications
        : DEFAULTS.calendarNotifications,
    autoUpdate: typeof parsed.autoUpdate === 'boolean' ? parsed.autoUpdate : DEFAULTS.autoUpdate,
    taskRollover:
      typeof parsed.taskRollover === 'boolean' ? parsed.taskRollover : DEFAULTS.taskRollover,
    dailyGoalMin: clampInt(parsed.dailyGoalMin, 15, 720, 'dailyGoalMin'),
    textScale: parsed.textScale === undefined ? DEFAULTS.textScale : parseTextScale(parsed.textScale),
    boardCanvas: parsed.boardCanvas === undefined ? DEFAULTS.boardCanvas : parseBoardCanvas(parsed.boardCanvas),
    googleCalendarPollMinutes:
      parsed.googleCalendarPollMinutes === undefined
        ? DEFAULTS.googleCalendarPollMinutes
        : parsePollMinutes(parsed.googleCalendarPollMinutes),
    appleCalendarEnabled:
      typeof parsed.appleCalendarEnabled === 'boolean'
        ? parsed.appleCalendarEnabled
        : DEFAULTS.appleCalendarEnabled,
    appleCalendarIds: parseCalendarIds(parsed.appleCalendarIds),
    appleCalendarPollMinutes:
      parsed.appleCalendarPollMinutes === undefined
        ? DEFAULTS.appleCalendarPollMinutes
        : parseApplePollMinutes(parsed.appleCalendarPollMinutes),
    planPreviewExhausted:
      typeof parsed.planPreviewExhausted === 'boolean'
        ? parsed.planPreviewExhausted
        : DEFAULTS.planPreviewExhausted,
    quickCaptureEnabled:
      typeof parsed.quickCaptureEnabled === 'boolean'
        ? parsed.quickCaptureEnabled
        : DEFAULTS.quickCaptureEnabled,
    quickCaptureShortcut:
      typeof parsed.quickCaptureShortcut === 'string' && parsed.quickCaptureShortcut.trim()
        ? parsed.quickCaptureShortcut.trim()
        : defaultQuickCaptureShortcut(),
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

export function appleCalendarPollIntervalMs(): number {
  return readSettings().appleCalendarPollMinutes * 60_000;
}

export function readPomodoroSeconds(): number {
  return readSettings().pomodoroMinutes * 60;
}

export function readTimerMode(): TimerMode {
  return readSettings().timerMode;
}

export function readEndBell(): boolean {
  return readSettings().endBell;
}

export function readTaskRollover(): boolean {
  return readSettings().taskRollover;
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
