import { useState } from 'react';

import { useT } from '@nordly-i18n';

import { useOnlineStatus } from '@shared/hooks/useOnlineStatus';
import { isCloudEnabled } from '@shared/model/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';
import { AuthKind, useSessionStore } from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';

function readLocalBannerDismissed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.localAuthBannerDismissed) === '1';
  } catch {
    return false;
  }
}

function writeLocalBannerDismissed(): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.localAuthBannerDismissed, '1');
  } catch (err) {
    console.warn('[nordly:sync-banner] dismiss persist failed', err);
  }
}

/** Global banner: soft sign-in for local profiles, or non-dismissible cloud reauth. */
export function SyncStatusBanner(): JSX.Element | null {
  const t = useT();
  const online = useOnlineStatus();
  const authKind = useSessionStore((s) => s.authKind);
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);
  const [localDismissed, setLocalDismissed] = useState(readLocalBannerDismissed);

  if (!isCloudEnabled()) return null;

  const needsLocalSignIn =
    authKind === AuthKind.Local && !localDismissed;
  const needsReauth =
    sessionReauthRequired && authKind === AuthKind.Cloud;
  if (!needsLocalSignIn && !needsReauth) return null;

  const text = needsReauth
    ? online
      ? t('nordly.sync.banner_reauth_online')
      : t('nordly.sync.banner_reauth_offline')
    : online
      ? t('nordly.sync.banner_sign_in_online')
      : t('nordly.sync.banner_sign_in_offline');

  const dismissLocal = (): void => {
    writeLocalBannerDismissed();
    setLocalDismissed(true);
  };

  return (
    <div
      className="nordly-sync-banner"
      role="status"
      data-kind={needsReauth ? 'reauth' : 'sign-in'}
      data-no-drag
    >
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
            {needsReauth ? t('nordly.sync.reauth_sign_in') : t('nordly.sync.sign_in')}
          </button>
        ) : null}
        {needsLocalSignIn ? (
          <button
            type="button"
            className="nordly-sync-banner__btn focus-ring"
            onClick={dismissLocal}
          >
            {t('nordly.sync.banner_dismiss')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
