import { useEffect } from 'react';

import { useT } from '@nordly-i18n';

import { isCloudEnabled } from '@shared/model/features';
import { useOnlineStatus } from '@shared/hooks/useOnlineStatus';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useSyncStore } from '@shared/model/sync';

/** Global banner for session reauth only — passive offline/sync noise stays silent. */
export function SyncStatusBanner(): JSX.Element | null {
  const t = useT();
  const online = useOnlineStatus();
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);
  const dismissedKey = useSyncStore((s) => s.dismissedSyncBannerKey);
  const setDismissedKey = useSyncStore((s) => s.setDismissedSyncBannerKey);

  const kind = isCloudEnabled() && sessionReauthRequired ? 'reauth' : null;
  const key = kind;

  useEffect(() => {
    if (!kind) {
      if (dismissedKey) setDismissedKey(null);
      return;
    }
    if (!key || !dismissedKey) return;
    if (dismissedKey !== key) setDismissedKey(null);
  }, [dismissedKey, key, kind, setDismissedKey]);

  if (!kind || !key || dismissedKey === key) return null;

  const text = online
    ? t('nordly.sync.banner_reauth_online')
    : t('nordly.sync.banner_reauth_offline');

  return (
    <div className="nordly-sync-banner" role="status" data-kind={kind} data-no-drag>
      <span className="nordly-sync-banner__text" title={text}>
        {text}
      </span>
      <div className="nordly-sync-banner__actions">
        {online ? (
          <button
            type="button"
            className="nordly-sync-banner__btn focus-ring"
            onClick={() => window.dispatchEvent(new Event(NORDLY_EVENTS.openReauthLogin))}
          >
            {t('nordly.sync.reauth_sign_in')}
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
