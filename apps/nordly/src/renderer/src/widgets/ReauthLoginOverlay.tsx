import { useRef } from 'react';

import { useT } from '@nordly-i18n';

import { LoginScreen } from '@widgets/LoginScreen';
import { useDialogSurface } from '@shared/hooks/useDialogSurface';
import { AuthKind, useSessionStore } from '@shared/model/session';

interface ReauthLoginOverlayProps {
  onClose: () => void;
}

/** Modal login for first-time cloud auth (local profile) or cloud session reauth. */
export function ReauthLoginOverlay({ onClose }: ReauthLoginOverlayProps): JSX.Element {
  const t = useT();
  const authKind = useSessionStore((s) => s.authKind);
  const reauth = authKind === AuthKind.Cloud;
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogSurface(dialogRef, onClose);
  return (
    <div
      ref={dialogRef}
      className="nordly-reauth-overlay"
      data-no-drag
      role="dialog"
      aria-modal="true"
      aria-label={reauth ? t('nordly.sync.reauth_dialog_aria') : t('nordly.sync.sign_in_dialog_aria')}
      tabIndex={-1}
    >
      <button
        type="button"
        className="nordly-reauth-overlay__backdrop focus-ring"
        aria-label={t('nordly.sync.reauth_close')}
        tabIndex={-1}
        onClick={onClose}
      />
      <div className="nordly-reauth-overlay__panel" onMouseDown={(e) => e.stopPropagation()}>
        <LoginScreen reauth={reauth} onSuccess={onClose} />
      </div>
    </div>
  );
}
