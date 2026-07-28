import { useT } from '@nordly-i18n';

import { LoginScreen } from '@widgets/LoginScreen';
import { useEscapeLayer } from '@shared/hooks/useEscapeLayer';
import { useSessionStore } from '@shared/model/session';

interface ReauthLoginOverlayProps {
  onClose: () => void;
}

/** Modal login for first-time cloud auth (local profile) or cloud session reauth. */
export function ReauthLoginOverlay({ onClose }: ReauthLoginOverlayProps): JSX.Element {
  const t = useT();
  const authKind = useSessionStore((s) => s.authKind);
  const reauth = authKind === 'cloud';
  useEscapeLayer(onClose);
  return (
    <div
      className="nordly-reauth-overlay"
      data-no-drag
      role="dialog"
      aria-modal="true"
      aria-label={reauth ? t('nordly.sync.reauth_dialog_aria') : t('nordly.sync.sign_in_dialog_aria')}
    >
      <button
        type="button"
        className="nordly-reauth-overlay__backdrop focus-ring"
        aria-label={t('nordly.sync.reauth_close')}
        onClick={onClose}
      />
      <div className="nordly-reauth-overlay__panel" onMouseDown={(e) => e.stopPropagation()}>
        <LoginScreen reauth={reauth} onSuccess={onClose} />
      </div>
    </div>
  );
}
