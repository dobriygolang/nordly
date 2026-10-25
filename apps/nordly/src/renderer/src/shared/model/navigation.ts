export const PageId = {
  Home: 'home',
  Today: 'today',
  Notes: 'notes',
  Whiteboard: 'whiteboard',
  Calendar: 'calendar',
  Planning: 'planning',
  Cards: 'cards',
  Settings: 'settings',
} as const;
export type PageId = (typeof PageId)[keyof typeof PageId];

export const PaletteAction = {
  ...PageId,
  Stats: 'stats',
} as const;
export type PaletteAction = (typeof PaletteAction)[keyof typeof PaletteAction];

export interface EntityNavigationRequest {
  id: string;
  requestKey: number;
}

export const NAV_PAGES = new Set<PageId>(Object.values(PageId));

export function isPageId(value: string): value is PageId {
  return NAV_PAGES.has(value as PageId);
}
