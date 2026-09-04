import {
  dbGet,
  dbGetAllByUser,
  dbPut,
  dbPutMany,
  entityKey,
  requireUserId,
} from '@shared/db/nordlyDb';
import type { FocusTimerMode } from '@shared/model/pomodoro';

export interface StoredFocusSession {
  userId: string;
  id: string;
  key: string;
  planItemId: string;
  pinnedTitle: string;
  startedAt: string;
  endedAt: string | null;
  pomodorosCompleted: number;
  secondsFocused: number;
  mode: FocusTimerMode;
  synced?: boolean;
}

function rowFrom(
  userId: string,
  partial: Omit<StoredFocusSession, 'key' | 'userId'>,
): StoredFocusSession {
  return { ...partial, userId, key: entityKey(partial.id, userId) };
}

export function sameFocusSessions(a: StoredFocusSession[], b: StoredFocusSession[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.planItemId !== right.planItemId ||
      left.pinnedTitle !== right.pinnedTitle ||
      left.startedAt !== right.startedAt ||
      left.endedAt !== right.endedAt ||
      left.secondsFocused !== right.secondsFocused ||
      left.pomodorosCompleted !== right.pomodorosCompleted ||
      left.mode !== right.mode ||
      left.synced !== right.synced
    ) {
      return false;
    }
  }
  return true;
}

export async function focusStorePut(session: StoredFocusSession): Promise<void> {
  await dbPut('focus_sessions', session);
}

export async function focusStoreGet(id: string, userId?: string): Promise<StoredFocusSession | null> {
  const uid = userId ?? requireUserId();
  return dbGet<StoredFocusSession>('focus_sessions', entityKey(id, uid));
}

export async function focusStoreList(userId?: string): Promise<StoredFocusSession[]> {
  const uid = userId ?? requireUserId();
  return dbGetAllByUser<StoredFocusSession>('focus_sessions', uid);
}

export async function focusStoreBulkImport(
  userId: string,
  records: Record<string, Omit<StoredFocusSession, 'key' | 'userId'>>,
): Promise<void> {
  await dbPutMany(
    'focus_sessions',
    Object.values(records).map((session) => rowFrom(userId, session)),
  );
}

export async function focusStoreUnsynced(userId?: string): Promise<StoredFocusSession[]> {
  const rows = await focusStoreList(userId);
  return rows.filter((s) => s.endedAt && !s.synced);
}

/** Most recent session without endedAt — open focus burst. */
export async function findOpenFocusSession(userId?: string): Promise<StoredFocusSession | null> {
  const rows = await focusStoreList(userId);
  const open = rows.filter((s) => !s.endedAt);
  if (open.length === 0) return null;
  open.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return open[0] ?? null;
}

export { rowFrom };
