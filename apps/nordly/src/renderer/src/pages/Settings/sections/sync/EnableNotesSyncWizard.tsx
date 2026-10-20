import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  enableNotesSync,
  planNotesSyncEnable,
  type NotesSyncEnablePlan,
} from '@features/notes/api/notesSync';
import { passphraseStrength } from '@features/notes/lib/passphraseStrength';
import {
  generateRecoveryPhrase,
  saveRecoveryWrap,
} from '@shared/crypto/recoveryKey';
import {
  initVault,
  isVaultUnlocked,
  unlockVault,
} from '@shared/crypto/vault';
import { isVaultEnabledSync, setVaultEnabled } from '@shared/crypto/vaultPrefs';
import { useDialogFocus } from '@shared/hooks/useDialogFocus';
import { useEscapeLayer } from '@shared/hooks/useEscapeLayer';
import { useSessionStore } from '@shared/model/session';

type Step = 'choose' | 'passphrase' | 'recovery' | 'merge';

interface EnableNotesSyncWizardProps {
  onClose: () => void;
  onEnabled: () => void;
  onChooseOtherFolder: () => void;
}

export function EnableNotesSyncWizard({
  onClose,
  onEnabled,
  onChooseOtherFolder,
}: EnableNotesSyncWizardProps) {
  const t = useT();
  const userId = useSessionStore((s) => s.userId);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [plan, setPlan] = useState<NotesSyncEnablePlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [encrypt, setEncrypt] = useState(true);
  const [step, setStep] = useState<Step>('choose');
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [phrase, setPhrase] = useState('');
  const [recoverySaved, setRecoverySaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    void planNotesSyncEnable()
      .then((next) => {
        if (live) setPlan(next);
      })
      .catch((err: unknown) => {
        if (live) setPlanError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEscapeLayer(onClose, !busy);
  useDialogFocus(dialogRef, true);

  const finish = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await enableNotesSync({ encrypt });
      onEnabled();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [encrypt, onEnabled]);

  const afterCrypto = useCallback(async () => {
    if (plan && plan.remoteNoteCount > 0) {
      setStep('merge');
      return;
    }
    await finish();
  }, [finish, plan]);

  const continueFromChoose = useCallback(async () => {
    setError(null);
    if (!encrypt) {
      if (plan && plan.remoteNoteCount > 0) {
        setStep('merge');
        return;
      }
      await finish();
      return;
    }
    if (isVaultEnabledSync() && isVaultUnlocked()) {
      if (plan && plan.remoteNoteCount > 0) {
        setStep('merge');
        return;
      }
      await finish();
      return;
    }
    setStep('passphrase');
  }, [encrypt, finish, plan]);

  const submitPassphrase = useCallback(async () => {
    if (!userId) return;
    setError(null);
    const unlocking = isVaultEnabledSync();
    if (!unlocking && passphraseStrength(pwd1) !== 'ok') {
      setError(t('nordly.notes.sync.passphrase_weak'));
      return;
    }
    if (!unlocking && pwd1 !== pwd2) {
      setError(t('nordly.vault.err.mismatch'));
      return;
    }
    setBusy(true);
    try {
      if (unlocking) {
        await unlockVault(pwd1);
        await afterCrypto();
        return;
      }
      await initVault();
      await unlockVault(pwd1);
      setPhrase(generateRecoveryPhrase());
      setStep('recovery');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [afterCrypto, pwd1, pwd2, t, userId]);

  const savePhrase = useCallback(async () => {
    if (!userId || !phrase) return;
    setBusy(true);
    setError(null);
    try {
      await saveRecoveryWrap(pwd1, phrase);
      await setVaultEnabled(true, userId);
      await afterCrypto();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [afterCrypto, phrase, pwd1, userId]);

  const folderName = plan ? plan.folder.split(/[/\\]/).pop() || plan.folder : '';
  const strength = passphraseStrength(pwd1);

  return (
    <div className="nordly-vault-modal-backdrop fadein" onClick={() => { if (!busy) onClose(); }}>
      <div
        ref={dialogRef}
        className="nordly-vault-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nordly-notes-sync-wizard-title"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="nordly-notes-sync-wizard-title" className="nordly-vault-modal__title">
          {t('nordly.notes.sync.wizard_title')}
        </h2>

        {planError ? <p className="nordly-vault-modal__error mono">{planError}</p> : null}

        {step === 'choose' && plan ? (
          <>
            <p className="nordly-vault-modal__body">
              {t('nordly.notes.sync.wizard_body', { count: plan.localNoteCount, folder: folderName })}
            </p>
            <label className="nordly-vault-modal__check">
              <input
                type="radio"
                name="notes-sync-encrypt"
                checked={encrypt}
                onChange={() => setEncrypt(true)}
              />
              {t('nordly.notes.sync.encrypt_on')}
            </label>
            <label className="nordly-vault-modal__check">
              <input
                type="radio"
                name="notes-sync-encrypt"
                checked={!encrypt}
                onChange={() => setEncrypt(false)}
              />
              {t('nordly.notes.sync.encrypt_off')}
            </label>
            {!encrypt ? (
              <p className="nordly-vault-modal__body">{t('nordly.notes.sync.encrypt_off_warning')}</p>
            ) : null}
          </>
        ) : null}

        {step === 'passphrase' ? (
          <>
            <p className="nordly-vault-modal__body">
              {isVaultEnabledSync()
                ? t('nordly.vault.unlock.body')
                : t('nordly.notes.sync.passphrase_hint')}
            </p>
            <form
              className="nordly-vault-modal__form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPassphrase();
              }}
            >
              <input
                type="password"
                value={pwd1}
                autoFocus
                onChange={(event) => setPwd1(event.target.value)}
                aria-label={t('nordly.vault.input.passphrase')}
              />
              {!isVaultEnabledSync() ? (
                <>
                  <input
                    type="password"
                    value={pwd2}
                    onChange={(event) => setPwd2(event.target.value)}
                    aria-label={t('nordly.vault.input.confirm')}
                  />
                  <p className="mono nordly-vault-modal__body">
                    {t(`nordly.notes.sync.passphrase_${strength}`)}
                  </p>
                </>
              ) : null}
            </form>
          </>
        ) : null}

        {step === 'recovery' ? (
          <>
            <p className="nordly-vault-modal__body">{t('nordly.settings.vault.recovery_save_body')}</p>
            <pre className="nordly-vault-modal__phrase mono">{phrase}</pre>
            <label className="nordly-vault-modal__check">
              <input
                type="checkbox"
                checked={recoverySaved}
                onChange={(event) => setRecoverySaved(event.target.checked)}
              />
              {t('nordly.settings.vault.recovery_saved_ack')}
            </label>
          </>
        ) : null}

        {step === 'merge' && plan ? (
          <>
            <p className="nordly-vault-modal__body">
              {t('nordly.notes.sync.merge_body', { count: plan.remoteNoteCount })}
            </p>
            <div className="nordly-vault-modal__actions">
              <button type="button" className="nordly-vault-modal__primary" disabled={busy} onClick={() => void finish()}>
                {t('nordly.notes.sync.merge_action')}
              </button>
              <button type="button" className="nordly-vault-modal__secondary" disabled={busy} onClick={onChooseOtherFolder}>
                {t('nordly.notes.sync.other_folder')}
              </button>
            </div>
          </>
        ) : null}

        {error ? <p className="nordly-vault-modal__error mono">{error}</p> : null}

        {step !== 'merge' ? (
          <div className="nordly-vault-modal__actions">
            <button type="button" className="nordly-vault-modal__secondary" disabled={busy} onClick={onClose}>
              {t('nordly.notes.sync.cancel')}
            </button>
            {step === 'choose' ? (
              <button
                type="button"
                className="nordly-vault-modal__primary"
                disabled={busy || !loaded || !plan}
                onClick={() => void continueFromChoose()}
              >
                {t('nordly.notes.sync.continue')}
              </button>
            ) : null}
            {step === 'passphrase' ? (
              <button
                type="button"
                className="nordly-vault-modal__primary"
                disabled={busy || (!isVaultEnabledSync() && passphraseStrength(pwd1) !== 'ok')}
                onClick={() => void submitPassphrase()}
              >
                {t('nordly.notes.sync.continue')}
              </button>
            ) : null}
            {step === 'recovery' ? (
              <button
                type="button"
                className="nordly-vault-modal__primary"
                disabled={busy || !recoverySaved}
                onClick={() => void savePhrase()}
              >
                {t('nordly.settings.vault.recovery_done')}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="nordly-vault-modal__actions">
            <button type="button" className="nordly-vault-modal__secondary" disabled={busy} onClick={onClose}>
              {t('nordly.notes.sync.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
