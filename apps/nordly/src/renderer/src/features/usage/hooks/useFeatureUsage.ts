import { useCallback, useEffect, useState } from 'react';

import { ensureAccessTokenForSync } from '@shared/api/authSession';
import { fetchBillingMe, type BillingMe } from '@shared/api/billingClient';
import { countPublishedNotes } from '@features/notes/api/notesClient';
import { buildFeatureUsage, type FeatureUsageSnapshot } from '@shared/lib/featureUsage';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { useFeatureUsageStore } from '@shared/model/featureUsage';

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
      if (!isCloudApiAvailable()) {
        setError('session');
        setMe(null);
        return;
      }
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
