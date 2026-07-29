import { STORAGE_KEYS } from '@shared/lib/storage-keys';

export type ThemeId =
  | 'drift'
  | 'visor'
  | 'winter'
  | 'birthday-light'
  | 'particles'
  | 'debris'
  | 'launch';

export const THEME_IDS: ThemeId[] = [
  'drift',
  'visor',
  'winter',
  'birthday-light',
  'particles',
  'debris',
  'launch',
];

/** Default home-screen canvas — manga ink portrait with ripple animation. */
export const DEFAULT_THEME_ID: ThemeId = 'launch';

const THEME_POSTER_SRC: Partial<Record<ThemeId, string>> = {
  drift: '/backgrounds/drift.png',
  visor: '/backgrounds/visor.png',
  debris: '/backgrounds/debris.png',
  launch: '/backgrounds/launch.png',
  'birthday-light': '/backgrounds/birthday-light.png',
};

/** Static poster image for non-animated image-based canvas themes. */
export function themePosterSrc(theme: ThemeId): string | null {
  return THEME_POSTER_SRC[theme] ?? null;
}

const THEME_KEY = STORAGE_KEYS.theme;

export function readStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (!v) return DEFAULT_THEME_ID;
    if ((THEME_IDS as readonly string[]).includes(v)) return v as ThemeId;
    throw new Error(`Invalid stored theme: ${v}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid stored theme:')) throw err;
    console.warn('[theme] read failed', err);
    return DEFAULT_THEME_ID;
  }
}

export function persistTheme(id: ThemeId): void {
  if (typeof window === 'undefined') return;
  if (!(THEME_IDS as readonly string[]).includes(id)) {
    throw new Error(`Invalid theme id: ${id}`);
  }
  try {
    window.localStorage.setItem(THEME_KEY, id);
  } catch (err) {
    console.warn('[theme] persist failed', err);
  }
}
