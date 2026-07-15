export type PageId =
  | 'home'
  | 'today'
  | 'notes'
  | 'whiteboard'
  | 'calendar'
  | 'planning'
  | 'settings';

export type PaletteAction = PageId | 'stats';

export interface EntityNavigationRequest {
  id: string;
  requestKey: number;
}

export const NAV_PAGES = new Set<PageId>([
  'home',
  'today',
  'notes',
  'whiteboard',
  'calendar',
  'planning',
  'settings',
]);

export function isPageId(value: string): value is PageId {
  return NAV_PAGES.has(value as PageId);
}
