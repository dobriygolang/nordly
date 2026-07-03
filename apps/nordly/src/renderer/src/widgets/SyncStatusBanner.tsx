import { useMemo } from 'react';

import { useT } from '@nordly-i18n';

import { isCloudEnabled } from '@shared/model/features';
import { useOnlineStatus } from '@shared/hooks/useOnlineStatus';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useSyncStore } from '@shared/model/sync';
import { flushSync } from '@shared/sync/SyncEngine';
import { openPricingPage } from '@shared/api/billingClient';

type BannerKind = 'offline' | 'unreachable' | 'error' | 'reauth' | 'cloud_sync_blocked' | null;

export function SyncStatusBanner(): JSX.Element | null {
  const t = useT();
  const online = useOnlineStatus();
  const status = useSyncStore((s) => s.status);
  const lastError = useSyncStore((s) => s.lastError);
  const serverReachable = useSyncStore((s) => s.serverReachable);
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);
  const cloudSyncBlocked = useSyncStore((s) => s.cloudSyncBlocked);
  const cloudSyncBlockReason = useSyncStore((s) => s.cloudSyncBlockReason);

  const kind = useMemo((): BannerKind => {
    if (!isCloudEnabled()) return null;
    if (sessionReauthRequired) return 'reauth';
    if (cloudSyncBlocked) return 'cloud_sync_blocked';
    if (!online || status === 'offline') return 'offline';
    if (!serverReachable) return 'unreachable';
    if (status === 'error' && lastError) return 'error';
    return null;
  }, [online, status, lastError, serverReachable, sessionReauthRequired, cloudSyncBlocked]);

  if (!kind) return null;

  const message =
    kind === 'reauth'
      ? online
        ? t('nordly.sync.banner_reauth_online')
        : t('nordly.sync.banner_reauth_offline')
      : kind === 'cloud_sync_blocked'
        ? cloudSyncBlockReason === 'device_limit_exceeded'
          ? t('nordly.sync.banner_device_limit')
          : t('nordly.sync.banner_cloud_sync_pro')
        : kind === 'offline'
          ? t('nordly.sync.banner_offline')
          : kind === 'unreachable'
            ? t('nordly.sync.banner_unreachable')
            : t('nordly.sync.banner_error');

  const showRetry = kind === 'error' || kind === 'unreachable';
  const showReauth = kind === 'reauth' && online;
  const showUpgrade = kind === 'cloud_sync_blocked';

  const detail =
    kind === 'error' && lastError
      ? lastError
      : kind === 'cloud_sync_blocked'
        ? t('nordly.settings.plan.upgrade_hint')
        : null;

  return (
    <div className="nordly-sync-banner" role="status" data-kind={kind} data-no-drag>
      <span className="nordly-sync-banner__text" title={detail ?? undefined}>
        {message}
        {detail ? <span className="nordly-sync-banner__detail"> — {detail}</span> : null}
      </span>
      {showUpgrade ? (
        <button
          type="button"
          className="nordly-sync-banner__btn focus-ring"
          onClick={() => openPricingPage()}
        >
          {t('nordly.settings.plan.upgrade')}
        </button>
      ) : null}
      {showReauth ? (
        <button
          type="button"
          className="nordly-sync-banner__btn focus-ring"
          onClick={() => window.dispatchEvent(new Event(NORDLY_EVENTS.openReauthLogin))}
        >
          {t('nordly.sync.reauth_sign_in')}
        </button>
      ) : null}
      {showRetry ? (
        <button
          type="button"
          className="nordly-sync-banner__btn focus-ring"
          onClick={() => {
            useSyncStore.getState().setLastError(null);
            useSyncStore.getState().setStatus('syncing');
            void flushSync().catch((err: unknown) => {
              useSyncStore.getState().setLastError(err instanceof Error ? err.message : String(err));
            });
          }}
        >
          {t('nordly.sync.retry')}
        </button>
      ) : null}
    </div>
  );
}
