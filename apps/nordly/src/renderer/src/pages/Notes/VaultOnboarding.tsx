import { useCallback, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  exportIdbNotesToVault,
  vaultPickFolder,
  vaultSetConfig,
  vaultStartWatch,
} from '@features/notes/vault';
import {
  refreshNotesVaultBoundCache,
  setNotesVaultBoundCache,
} from '@features/notes/api/notesClient';
import { isTauriRuntime } from '@platform/runtime';
import { errorMessage } from './utils';

export interface VaultBoundResult {
  skippedLocked: number;
}

interface VaultOnboardingProps {
  onBound: (result?: VaultBoundResult) => void;
}

export function VaultOnboarding({ onBound }: VaultOnboardingProps) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportExisting, setExportExisting] = useState(true);

  const choose = useCallback(async () => {
    if (!isTauriRuntime()) {
      setError(t('nordly.notes.vault_onboarding.desktop_only'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const folder = await vaultPickFolder();
      if (!folder) {
        setBusy(false);
        return;
      }
      let skippedLocked = 0;
      if (exportExisting) {
        const result = await exportIdbNotesToVault(folder, 'img');
        skippedLocked = result.skippedLocked;
      } else {
        await vaultSetConfig({
          root: folder,
          attachmentFolder: 'img',
          // No export performed — keep false so Settings can still offer export later.
          migratedFromIdb: false,
        });
      }
      setNotesVaultBoundCache(true);
      await refreshNotesVaultBoundCache();
      await vaultStartWatch();
      onBound({ skippedLocked });
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }, [exportExisting, onBound, t]);

  return (
    <div className="nordly-vault-empty nordly-notes-vault-onboarding">
      <p className="nordly-notes-vault-onboarding__title">
        {t('nordly.notes.vault_onboarding.title')}
      </p>
      <p className="nordly-notes-vault-onboarding__body">
        {t('nordly.notes.vault_onboarding.body')}
      </p>
      <label className="nordly-notes-vault-onboarding__export">
        <input
          type="checkbox"
          checked={exportExisting}
          disabled={busy}
          onChange={(e) => setExportExisting(e.target.checked)}
        />
        <span className="nordly-notes-vault-onboarding__export-box" aria-hidden="true" />
        <span>{t('nordly.notes.vault_onboarding.export_existing')}</span>
      </label>
      <button
        type="button"
        className="nordly-vault-empty__cta focus-ring"
        disabled={busy}
        onClick={() => void choose()}
      >
        {busy
          ? t('nordly.notes.vault_onboarding.working')
          : t('nordly.notes.vault_onboarding.choose')}
      </button>
      {error && <p className="mono nordly-vault-editor__error">{error}</p>}
    </div>
  );
}
