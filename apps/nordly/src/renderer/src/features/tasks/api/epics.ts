/** Tracker epics (UI: tags) — synced when online, cached in IndexedDB for offline UI. */

export interface TaskEpic {
  id: string;
  name: string;
  color: string;
}

/**
 * Same 4 colors as tracker defaults — used when cache/API unavailable.
 * UI labels are localized color names (tags), not Work/Personal.
 */
export const OFFLINE_EPIC_STUBS: TaskEpic[] = [
  { id: 'offline-0', name: 'Blue', color: '#5b8def' },
  { id: 'offline-1', name: 'Green', color: '#4cb35c' },
  { id: 'offline-2', name: 'Purple', color: '#c084fc' },
  { id: 'offline-3', name: 'Orange', color: '#f59e0b' },
];

export function isOfflineEpicId(id: string): boolean {
  return id.startsWith('offline-');
}
