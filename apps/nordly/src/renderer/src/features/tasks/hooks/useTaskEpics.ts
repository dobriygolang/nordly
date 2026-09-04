import { useCallback, useEffect, useState } from 'react';

import {
  fetchRemoteEpics,
  listCachedEpics,
  OFFLINE_EPIC_STUBS,
  replaceEpicsCache,
  sameEpics,
  type TaskEpic,
} from '@features/tasks/api/epics';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { isSyncEnabled } from '@shared/sync/syncConfig';
import { isAuthError } from '@features/tasks/lib/taskActionErrors';
import { useSyncStore } from '@shared/model/sync';
import { AuthStatus, useSessionStore } from '@shared/model/session';

/** Load tracker epics — IndexedDB cache first, refresh from API when sync is on. */
export function useTaskEpics(): {
  epics: TaskEpic[];
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [epics, setEpics] = useState<TaskEpic[]>(OFFLINE_EPIC_STUBS);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { status, userId } = useSessionStore.getState();
    if (status !== AuthStatus.SignedIn || !userId) {
      setError(null);
      setEpics((prev) => (sameEpics(prev, OFFLINE_EPIC_STUBS) ? prev : OFFLINE_EPIC_STUBS));
      return;
    }

    const cached = await listCachedEpics(userId);
    if (cached.length > 0) setEpics((prev) => (sameEpics(prev, cached) ? prev : cached));

    if (!isSyncEnabled()) {
      setError(null);
      if (cached.length === 0) {
        setEpics((prev) => (sameEpics(prev, OFFLINE_EPIC_STUBS) ? prev : OFFLINE_EPIC_STUBS));
      }
      return;
    }

    let remote: TaskEpic[];
    try {
      remote = await fetchRemoteEpics();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isAuthError(err)) {
        useSyncStore.getState().setSessionReauthRequired(true);
        setError(message);
        return;
      }
      setError(message);
      if (cached.length === 0) {
        setEpics((prev) => (sameEpics(prev, OFFLINE_EPIC_STUBS) ? prev : OFFLINE_EPIC_STUBS));
      }
      return;
    }
    setError(null);
    await replaceEpicsCache(remote);
    const next = remote.length > 0 ? remote : OFFLINE_EPIC_STUBS;
    setEpics((prev) => (sameEpics(prev, next) ? prev : next));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSync = () => {
      const { status, userId } = useSessionStore.getState();
      if (status !== AuthStatus.SignedIn || !userId) return;
      void listCachedEpics(userId).then((cached) => {
        if (cached.length > 0) setEpics((prev) => (sameEpics(prev, cached) ? prev : cached));
      });
    };
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
  }, []);

  return { epics, error, refresh };
}
