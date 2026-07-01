/** Tracker epics — synced when online, cached in IndexedDB for offline UI. */

export interface TaskEpic {
  id: string;
  name: string;
  color: string;
}

/** Same colors as tracker default epics — used when cache/API unavailable. */
export const OFFLINE_EPIC_STUBS: TaskEpic[] = [
  { id: 'offline-0', name: 'Work', color: '#5b8def' },
  { id: 'offline-1', name: 'Personal', color: '#4cb35c' },
  { id: 'offline-2', name: 'Learning', color: '#c084fc' },
  { id: 'offline-3', name: 'Health', color: '#f59e0b' },
];

export function isOfflineEpicId(id: string): boolean {
  return id.startsWith('offline-');
}
