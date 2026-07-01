import { dbGet, dbPut, requireUserId } from '@shared/db/nordlyDb';

import type { TaskEpic } from '../api/epics';

function metaKey(userId: string): string {
  return `tracker_epics::${userId}`;
}

interface EpicsMetaRow {
  key: string;
  userId: string;
  epics: TaskEpic[];
  updatedAt: number;
}

export async function epicsStoreList(userId?: string): Promise<TaskEpic[]> {
  const uid = userId ?? requireUserId();
  const row = await dbGet<EpicsMetaRow>('meta', metaKey(uid));
  return row?.epics ?? [];
}

export async function epicsStoreReplace(epics: TaskEpic[], userId?: string): Promise<void> {
  const uid = userId ?? requireUserId();
  await dbPut('meta', {
    key: metaKey(uid),
    userId: uid,
    epics,
    updatedAt: Date.now(),
  });
}
