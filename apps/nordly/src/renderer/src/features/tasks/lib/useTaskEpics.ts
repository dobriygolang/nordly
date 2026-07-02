import { useCallback, useEffect, useState } from 'react';

import type { TaskEpic } from '@features/tasks/api/epics';
import { epicsStoreList, epicsStoreReplace } from '@features/tasks/repository/epicsStore';
import { remoteListEpics } from '@features/tasks/repository/tasksRemote';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { isSyncEnabled } from '@shared/sync/syncConfig';
import { useSyncStore } from '@shared/model/sync';

function isAuthError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b401\b|unauthorized/i.test(message);
}

/** Load tracker epics — IndexedDB cache first, refresh from API when sync is on. */
export function useTaskEpics(): { epics: TaskEpic[]; refresh: () => Promise<void> } {
  const [epics, setEpics] = useState<TaskEpic[]>([]);

  const refresh = useCallback(async () => {
    const cached = await epicsStoreList();

    if (cached.length > 0) setEpics(cached);

    if (!isSyncEnabled()) {
      if (cached.length === 0) setEpics([]);
      return;
    }

    let remote: TaskEpic[];
    try {
      remote = await remoteListEpics();
    } catch (err) {
      if (isAuthError(err)) {
        useSyncStore.getState().setSessionReauthRequired(true);
        return;
      }
      throw err;
    }
    await epicsStoreReplace(remote);
    setEpics(remote);
  }, []);

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      console.warn('[useTaskEpics] refresh unavailable:', err);
    });
  }, [refresh]);

  useEffect(() => {
    const onSync = () => void refresh().catch((err: unknown) => {
      console.warn('[useTaskEpics] sync refresh unavailable:', err);
    });
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
  }, [refresh]);

  return { epics, refresh };
}

export async function pullEpicsCache(): Promise<TaskEpic[]> {
  if (!isSyncEnabled()) {
    return epicsStoreList();
  }
  const remote = await remoteListEpics();
  await epicsStoreReplace(remote);
  return remote;
}
