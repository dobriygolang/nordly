import { PREFS_KEYS, clampInt } from '@shared/model/prefs';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';

export type TextScale = 'normal' | 'large' | 'xlarge';

export interface NordlySettings {
  pomodoroMinutes: number;
  notifications: boolean;
  textScale: TextScale;
  boardCanvas: BoardCanvasTheme;
}

export const SETTINGS_KEY = PREFS_KEYS.SETTINGS_KEY;
export const THEME_KEY = PREFS_KEYS.THEME_KEY;

export const TEXT_SCALES: TextScale[] = ['normal', 'large', 'xlarge'];

export const DEFAULTS: NordlySettings = {
  pomodoroMinutes: 25,
  notifications: true,
  textScale: 'normal',
  boardCanvas: 'dark',
};

function parseTextScale(v: unknown): TextScale {
  if (v === 'large' || v === 'xlarge') return v;
  return 'normal';
}

function parseBoardCanvas(v: unknown): BoardCanvasTheme {
  return v === 'light' ? 'light' : 'dark';
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
    };
  } catch {
    return DEFAULTS;
  }
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
