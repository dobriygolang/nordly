import { useOnlineStatus } from '@shared/hooks/useOnlineStatus';
import { isCloudEnabled } from '@shared/model/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useSyncStore } from '@shared/model/sync';
import { useT } from '@nordly-i18n';

/** Global banner for session reauth only — not dismissible (would hide the only CTA). */
export function SyncStatusBanner(): JSX.Element | null {
  const t = useT();
  const online = useOnlineStatus();
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);

  if (!isCloudEnabled() || !sessionReauthRequired) return null;

  const text = online
    ? t('nordly.sync.banner_reauth_online')
    : t('nordly.sync.banner_reauth_offline');

  return (
    <div className="nordly-sync-banner" role="status" data-kind="reauth" data-no-drag>
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
      </div>
    </div>
  );
}
