/** Tracker epics — synced when online, cached in IndexedDB for offline UI. */

export interface TaskEpic {
  id: string;
  name: string;
  color: string;
}

export function isOfflineEpicId(id: string): boolean {
  return id.startsWith('offline-');
}
