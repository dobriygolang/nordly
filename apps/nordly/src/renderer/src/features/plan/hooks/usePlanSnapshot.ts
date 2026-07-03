import { useCallback, useEffect, useState } from 'react';

import { ensureAccessTokenForSync } from '@shared/api/authSession';
import { fetchBillingMe, type BillingMe } from '@shared/api/billingClient';
import { notesStoreList } from '@features/notes/repository/notesStore';
import { remoteListNotes } from '@features/notes/repository/notesRemote';
import { remoteGetPublishStatus } from '@features/notes/repository/publishRemote';
import { getServerId } from '@shared/sync/idMap';
import { buildPlanSnapshot, type PlanSnapshot } from '@shared/lib/planSnapshot';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { readSettings } from '@shared/model/settings';
import { usePlanUsageStore } from '@shared/model/planUsage';
import { isSyncEnabled } from '@shared/sync/syncConfig';

async function countPublishedNotes(): Promise<number> {
  if (!isSyncEnabled()) return usePlanUsageStore.getState().publishedNotesCount;

  const notes = await notesStoreList();
  let count = 0;
  const batch = notes.slice(0, 60);
  await Promise.all(
    batch.map(async (note) => {
      const serverId = await getServerId('notes', note.id);
      if (!serverId) return;
      try {
        const st = await remoteGetPublishStatus(serverId);
        if (st.published) count++;
      } catch {
        /* skip unreachable */
      }
    }),
  );
  usePlanUsageStore.getState().setPublishedNotesCount(count);
  return count;
}

async function countCloudNotes(): Promise<number> {
  if (isSyncEnabled() && (await ensureAccessTokenForSync())) {
    try {
      const remote = await remoteListNotes();
      return remote.length;
    } catch {
      /* fall through */
    }
  }
  const local = await notesStoreList();
  return local.length;
}

export function usePlanSnapshot(): {
  snapshot: PlanSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const deviceRegistration = usePlanUsageStore((s) => s.deviceRegistration);
  const publishedNotesCount = usePlanUsageStore((s) => s.publishedNotesCount);
  const [me, setMe] = useState<BillingMe | null>(null);
  const [notesCount, setNotesCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(publishedNotesCount);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewExhausted, setPreviewExhausted] = useState(() => readSettings().planPreviewExhausted);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPreviewExhausted(readSettings().planPreviewExhausted);
    try {
      if (!(await ensureAccessTokenForSync())) {
        setError('session');
        setMe(null);
        return;
      }
      const [billing, notes, published] = await Promise.all([
        fetchBillingMe(),
        countCloudNotes(),
        countPublishedNotes(),
      ]);
      setMe(billing);
      setNotesCount(notes);
      setPublishedCount(published);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onSettings = (): void => setPreviewExhausted(readSettings().planPreviewExhausted);
    window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettings);
    return () => window.removeEventListener(NORDLY_EVENTS.settingsChanged, onSettings);
  }, []);

  const snapshot =
    me != null
      ? buildPlanSnapshot({
          me,
          notesCount,
          publishedCount,
          deviceRegistration,
          previewExhausted,
        })
      : null;

  return { snapshot, loading, error, refresh };
}
