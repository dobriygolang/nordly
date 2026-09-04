/** Tracker epics (UI: tags) — synced when online, cached in IndexedDB for offline UI. */
import { epicsStoreList, epicsStoreReplace } from '@features/tasks/repository/epicsStore';
import { remoteListEpics } from '@features/tasks/remote/tasksRemote';
import { isSyncEnabled } from '@shared/sync/syncConfig';

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

export function sameEpics(a: TaskEpic[], b: TaskEpic[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.id !== right.id || left.name !== right.name || left.color !== right.color) {
      return false;
    }
  }
  return true;
}

export function listCachedEpics(userId?: string): Promise<TaskEpic[]> {
  return epicsStoreList(userId);
}

export function replaceEpicsCache(epics: TaskEpic[], userId?: string): Promise<void> {
  return epicsStoreReplace(epics, userId);
}

export function fetchRemoteEpics(): Promise<TaskEpic[]> {
  return remoteListEpics();
}

/** Refresh the sync-owned epic cache, or read the existing offline cache. */
export async function pullEpicsCache(): Promise<TaskEpic[]> {
  if (!isSyncEnabled()) {
    const cached = await epicsStoreList();
    return cached.length > 0 ? cached : OFFLINE_EPIC_STUBS;
  }
  const remote = await remoteListEpics();
  await epicsStoreReplace(remote);
  return remote;
}
