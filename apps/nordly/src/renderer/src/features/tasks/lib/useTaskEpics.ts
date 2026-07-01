import { useCallback, useEffect, useState } from 'react';

import { LOCAL_ONLY } from '@app/config/features';
import { OFFLINE_EPIC_STUBS, type TaskEpic } from '@features/tasks/api/epics';
import { epicsStoreList, epicsStoreReplace } from '@features/tasks/repository/epicsStore';
import { remoteListEpics } from '@features/tasks/repository/tasksRemote';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { isSyncEnabled } from '@shared/sync/syncConfig';

/** Load tracker epics — IndexedDB cache first, refresh from API when sync is on. */
export function useTaskEpics(): { epics: TaskEpic[]; refresh: () => Promise<void> } {
  const [epics, setEpics] = useState<TaskEpic[]>(OFFLINE_EPIC_STUBS);

  const refresh = useCallback(async () => {
    let cached: TaskEpic[] = [];
    try {
      cached = await epicsStoreList();
    } catch {
      cached = [];
    }

    if (cached.length > 0) setEpics(cached);

    if (LOCAL_ONLY || !isSyncEnabled()) {
      if (cached.length === 0) setEpics(OFFLINE_EPIC_STUBS);
      return;
    }

    try {
      const remote = await remoteListEpics();
      await epicsStoreReplace(remote);
      setEpics(remote.length > 0 ? remote : OFFLINE_EPIC_STUBS);
    } catch {
      if (cached.length === 0) setEpics(OFFLINE_EPIC_STUBS);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSync = () => void refresh();
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
  }, [refresh]);

  return { epics, refresh };
}

export async function pullEpicsCache(): Promise<TaskEpic[]> {
  if (LOCAL_ONLY || !isSyncEnabled()) {
    const cached = await epicsStoreList();
    return cached.length > 0 ? cached : OFFLINE_EPIC_STUBS;
  }
  const remote = await remoteListEpics();
  await epicsStoreReplace(remote);
  return remote;
}
