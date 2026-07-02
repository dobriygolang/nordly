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
export function themePosterSrc(theme: ThemeId): string {
  return THEME_POSTER_SRC[theme] ?? '/backgrounds/launch.png';
}

const THEME_KEY = STORAGE_KEYS.theme;

export function readStoredTheme(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  const v = window.localStorage.getItem(THEME_KEY);
  if (!v) return DEFAULT_THEME_ID;
  if ((THEME_IDS as readonly string[]).includes(v)) return v as ThemeId;
  throw new Error(`Invalid stored theme: ${v}`);
}

export function persistTheme(id: ThemeId): void {
  if (typeof window === 'undefined') return;
  if (!(THEME_IDS as readonly string[]).includes(id)) {
    throw new Error(`Invalid theme id: ${id}`);
  }
  window.localStorage.setItem(THEME_KEY, id);
}
