import { useState } from 'react';

import { useT } from '@nordly-i18n';

import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useSessionStore } from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';
import { isCloudEnabled } from '@shared/model/features';

export function SignOutSection() {
  const t = useT();
  const userId = useSessionStore((s) => s.userId);
  const status = useSessionStore((s) => s.status);
  const authKind = useSessionStore((s) => s.authKind);
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);
  const clear = useSessionStore((s) => s.clear);
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clear();
      window.dispatchEvent(new Event(NORDLY_EVENTS.navHome));
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'signed_in') {
    return <p className="nordly-settings-signed-out">{t('nordly.settings.signed_out')}</p>;
  }

  if (authKind === 'local') {
    return (
      <div className="nordly-settings-account">
        <p className="nordly-settings-account__id mono">
          {t('nordly.settings.local_profile', {
            id: userId ? `${userId.slice(0, 8)}…${userId.slice(-4)}` : '—',
          })}
        </p>
        <p className="nordly-settings-account__reauth">
          {t(
            isCloudEnabled()
              ? 'nordly.settings.local_profile_hint'
              : 'nordly.settings.local_profile_hint_offline',
          )}
        </p>
        {isCloudEnabled() ? (
          <button
            type="button"
            className="nordly-settings-sign-out nordly-settings-sign-out--primary"
            onClick={() => window.dispatchEvent(new Event(NORDLY_EVENTS.openReauthLogin))}
          >
            {t('nordly.sync.sign_in')}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="nordly-settings-account">
      <p className="nordly-settings-account__id mono">
        {t('nordly.settings.signed_in', {
          id: userId ? `${userId.slice(0, 8)}…${userId.slice(-4)}` : '—',
        })}
      </p>
      {sessionReauthRequired ? (
        <p className="nordly-settings-account__reauth">{t('nordly.settings.session_reauth_hint')}</p>
      ) : null}
      {sessionReauthRequired ? (
        <button
          type="button"
          className="nordly-settings-sign-out nordly-settings-sign-out--primary"
          onClick={() => window.dispatchEvent(new Event(NORDLY_EVENTS.openReauthLogin))}
        >
          {t('nordly.sync.reauth_sign_in')}
        </button>
      ) : null}
      <button type="button" className="nordly-settings-sign-out" onClick={() => void handleSignOut()} disabled={busy}>
        {busy ? t('nordly.settings.sign_out.busy') : t('nordly.settings.sign_out')}
      </button>
    </div>
  );
}
