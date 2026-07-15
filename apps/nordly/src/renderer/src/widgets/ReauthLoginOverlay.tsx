import { useT } from '@nordly-i18n';

import { LoginScreen } from '@widgets/LoginScreen';
import { useEscapeLayer } from '@shared/hooks/useEscapeLayer';

interface ReauthLoginOverlayProps {
  onClose: () => void;
}

/** Modal re-login when cloud session expired but local data remains. */
export function ReauthLoginOverlay({ onClose }: ReauthLoginOverlayProps): JSX.Element {
  const t = useT();
  useEscapeLayer(onClose);
  return (
    <div className="nordly-reauth-overlay" data-no-drag role="dialog" aria-modal="true" aria-label={t('nordly.sync.reauth_dialog_aria')}>
      <button
        type="button"
        className="nordly-reauth-overlay__backdrop focus-ring"
        aria-label={t('nordly.sync.reauth_close')}
        onClick={onClose}
      />
      <div className="nordly-reauth-overlay__panel" onMouseDown={(e) => e.stopPropagation()}>
        <LoginScreen reauth onSuccess={onClose} />
      </div>
    </div>
  );
}
