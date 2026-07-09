import { useCallback, useEffect, useState } from 'react';

import { ensureAccessTokenForSync } from '@shared/api/authSession';
import { fetchBillingMe, type BillingMe } from '@shared/api/billingClient';
import { notesStoreList } from '@features/notes/repository/notesStore';
import { remoteGetPublishStatus } from '@features/notes/repository/publishRemote';
import { getDbUserId } from '@shared/db/nordlyDb';
import { getServerId } from '@shared/sync/idMap';
import { buildFeatureUsage, type FeatureUsageSnapshot } from '@shared/lib/featureUsage';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { useFeatureUsageStore } from '@shared/model/featureUsage';

async function countPublishedNotes(): Promise<number> {
  if (!isCloudApiAvailable() || !getDbUserId()) {
    return useFeatureUsageStore.getState().publishedNotesCount;
  }

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
  useFeatureUsageStore.getState().setPublishedNotesCount(count);
  return count;
}

export function useFeatureUsage(): {
  snapshot: FeatureUsageSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const deviceRegistration = useFeatureUsageStore((s) => s.deviceRegistration);
  const [me, setMe] = useState<BillingMe | null>(null);
  const [publishedCount, setPublishedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!(await ensureAccessTokenForSync())) {
        setError('session');
        setMe(null);
        return;
      }
      const [billing, published] = await Promise.all([fetchBillingMe(), countPublishedNotes()]);
      setMe(billing);
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

  const snapshot =
    me != null
      ? buildFeatureUsage({
          me,
          publishedCount,
          deviceRegistration,
        })
      : null;

  return { snapshot, loading, error, refresh };
}
