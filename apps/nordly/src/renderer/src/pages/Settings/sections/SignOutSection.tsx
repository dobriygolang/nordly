import { useState } from 'react';

import { useT } from '@nordly-i18n';

import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useSessionStore } from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';

export function SignOutSection() {
  const t = useT();
  const userId = useSessionStore((s) => s.userId);
  const status = useSessionStore((s) => s.status);
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);
  const clear = useSessionStore((s) => s.clear);
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await clear();
    } finally {
      setBusy(false);
    }
  };

  if (status !== 'signed_in') {
    return <p className="nordly-settings-signed-out">{t('nordly.settings.signed_out')}</p>;
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
      <button type="button" className="nordly-settings-sign-out" onClick={() => void handleClick()} disabled={busy}>
        {busy ? t('nordly.settings.sign_out.busy') : t('nordly.settings.sign_out')}
      </button>
    </div>
  );
}
