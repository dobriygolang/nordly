import { useMemo } from 'react';

import { useT } from '@nordly-i18n';

import { LOCAL_ONLY } from '@app/config/features';
import { useOnlineStatus } from '@shared/hooks/useOnlineStatus';
import { useSyncStore } from '@shared/model/sync';
import { flushSync } from '@shared/sync/SyncEngine';

type BannerKind = 'offline' | 'unreachable' | 'error' | 'recovering' | 'reauth' | null;

export function SyncStatusBanner(): JSX.Element | null {
  const t = useT();
  const online = useOnlineStatus();
  const status = useSyncStore((s) => s.status);
  const lastError = useSyncStore((s) => s.lastError);
  const serverReachable = useSyncStore((s) => s.serverReachable);
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);
  const pendingCount = useSyncStore((s) => s.pendingCount);

  const kind = useMemo((): BannerKind => {
    if (LOCAL_ONLY) return null;
    if (sessionReauthRequired && !online) return 'reauth';
    if (!online || status === 'offline') return 'offline';
    if (!serverReachable) return 'unreachable';
    if (status === 'error' && lastError) return 'error';
    if (status === 'syncing' && pendingCount > 0) return 'recovering';
    return null;
  }, [online, status, lastError, serverReachable, sessionReauthRequired, pendingCount]);

  if (!kind) return null;

  const message =
    kind === 'reauth'
      ? t('nordly.sync.banner_reauth_offline')
      : kind === 'offline'
        ? t('nordly.sync.banner_offline')
        : kind === 'unreachable'
          ? t('nordly.sync.banner_unreachable')
          : kind === 'error'
            ? t('nordly.sync.banner_error')
            : t('nordly.sync.banner_recovering');

  const showRetry = kind === 'error' || kind === 'unreachable';

  return (
    <div className="nordly-sync-banner" role="status">
      <span className="nordly-sync-banner__text">{message}</span>
      {showRetry ? (
        <button
          type="button"
          className="nordly-sync-banner__btn focus-ring"
          onClick={() => {
            void flushSync().catch(() => {
              /* banner stays until next success */
            });
          }}
        >
          {t('nordly.sync.retry')}
        </button>
      ) : null}
    </div>
  );
}
