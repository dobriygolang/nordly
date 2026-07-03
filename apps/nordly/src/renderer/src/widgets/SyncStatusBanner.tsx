import { useMemo } from 'react';

import { useT } from '@nordly-i18n';

import { isCloudEnabled } from '@shared/model/features';
import { useOnlineStatus } from '@shared/hooks/useOnlineStatus';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useSyncStore } from '@shared/model/sync';
import { flushSync } from '@shared/sync/SyncEngine';

type BannerKind = 'offline' | 'unreachable' | 'error' | 'reauth' | null;

export function SyncStatusBanner(): JSX.Element | null {
  const t = useT();
  const online = useOnlineStatus();
  const status = useSyncStore((s) => s.status);
  const lastError = useSyncStore((s) => s.lastError);
  const serverReachable = useSyncStore((s) => s.serverReachable);
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);

  const kind = useMemo((): BannerKind => {
    if (!isCloudEnabled()) return null;
    if (sessionReauthRequired) return 'reauth';
    if (!online || status === 'offline') return 'offline';
    if (!serverReachable) return 'unreachable';
    if (status === 'error' && lastError) return 'error';
    return null;
  }, [online, status, lastError, serverReachable, sessionReauthRequired]);

  if (!kind) return null;

  const message =
    kind === 'reauth'
      ? online
        ? t('nordly.sync.banner_reauth_online')
        : t('nordly.sync.banner_reauth_offline')
      : kind === 'offline'
        ? t('nordly.sync.banner_offline')
        : kind === 'unreachable'
          ? t('nordly.sync.banner_unreachable')
          : t('nordly.sync.banner_error');

  const showRetry = kind === 'error' || kind === 'unreachable';
  const showReauth = kind === 'reauth' && online;

  const detail = kind === 'error' && lastError ? lastError : null;

  return (
    <div className="nordly-sync-banner" role="status" data-kind={kind} data-no-drag>
      <span className="nordly-sync-banner__text" title={detail ?? undefined}>
        {message}
        {detail ? <span className="nordly-sync-banner__detail"> — {detail}</span> : null}
      </span>
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
