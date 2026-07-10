import { useEffect, useMemo } from 'react';

import { useT } from '@nordly-i18n';

import { isCloudEnabled } from '@shared/model/features';
import { useOnlineStatus } from '@shared/hooks/useOnlineStatus';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useSyncStore } from '@shared/model/sync';
import { flushSync } from '@shared/sync/SyncEngine';

type BannerKind = 'offline' | 'unreachable' | 'error' | 'reauth' | null;

function bannerKey(kind: Exclude<BannerKind, null>, lastError: string | null): string {
  if (kind === 'error' && lastError) return `error:${lastError}`;
  return kind;
}

export function SyncStatusBanner(): JSX.Element | null {
  const t = useT();
  const online = useOnlineStatus();
  const status = useSyncStore((s) => s.status);
  const lastError = useSyncStore((s) => s.lastError);
  const serverReachable = useSyncStore((s) => s.serverReachable);
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);
  const dismissedKey = useSyncStore((s) => s.dismissedSyncBannerKey);
  const setDismissedKey = useSyncStore((s) => s.setDismissedSyncBannerKey);

  const kind = useMemo((): BannerKind => {
    if (!isCloudEnabled()) return null;
    if (sessionReauthRequired) return 'reauth';
    if (!online || status === 'offline') return 'offline';
    if (!serverReachable) return 'unreachable';
    if (status === 'error' && lastError) return 'error';
    return null;
  }, [online, status, lastError, serverReachable, sessionReauthRequired]);

  const key = kind ? bannerKey(kind, lastError) : null;

  useEffect(() => {
    if (!kind) {
      if (dismissedKey) setDismissedKey(null);
      return;
    }
    if (!key || !dismissedKey) return;
    if (dismissedKey !== key) setDismissedKey(null);
  }, [dismissedKey, key, kind, setDismissedKey]);

  if (!kind || !key || dismissedKey === key) return null;

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

  const text =
    kind === 'error' && lastError
      ? lastError
      : message;

  const showRetry = kind === 'error' || kind === 'unreachable';
  const showReauth = kind === 'reauth' && online;

  return (
    <div className="nordly-sync-banner" role="status" data-kind={kind} data-no-drag>
      <span className="nordly-sync-banner__text" title={text}>
        {text}
      </span>
      <div className="nordly-sync-banner__actions">
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
        <button
          type="button"
          className="nordly-sync-banner__close focus-ring"
          aria-label={t('nordly.sync.banner_dismiss')}
          onClick={() => setDismissedKey(key)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
