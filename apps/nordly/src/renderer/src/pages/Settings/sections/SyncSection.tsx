import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import { disableNotesSync } from '@features/notes/api/notesSync';
import { useNotesSyncStatus } from '@features/notes/hooks/useNotesSyncStatus';
import { vaultGetConfig } from '@features/notes/api/vault';
import { ensureCloudAuth } from '@shared/api/authSession';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import {
  openSettings,
  SettingsHighlightId,
  SettingsSectionId,
  type SettingsHighlightId as HighlightId,
} from '@shared/model/settingsNav';

import { SettingRow, SettingsGroup } from '../primitives/SettingRow';
import { Toggle } from '../primitives/Toggle';
import { VaultSection } from './VaultSection';
import { EnableNotesSyncWizard } from './sync/EnableNotesSyncWizard';

function consentOn(kind: string): boolean {
  return kind !== 'off' && kind !== 'unavailable';
}

interface SyncSectionProps {
  highlight: HighlightId | null;
}

export function SyncSection({ highlight }: SyncSectionProps) {
  const t = useT();
  const status = useNotesSyncStatus();
  const enabled = consentOn(status.kind);
  const signedOut = status.kind === 'unavailable' && status.reason === 'signed_out';
  const localBuild = status.kind === 'unavailable' && status.reason === 'local_build';
  const [wizard, setWizard] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void vaultGetConfig()
      .then((config) => {
        if (live) setFolder(config?.root ?? null);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      live = false;
    };
  }, []);

  const turnOn = useCallback(async () => {
    setError(null);
    if (!isCloudApiAvailable()) {
      const ok = await ensureCloudAuth();
      if (!ok) return;
    }
    setWizard(true);
  }, []);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await disableNotesSync();
      setConfirmOff(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const statusText = (() => {
    switch (status.kind) {
      case 'unavailable':
        return status.reason === 'local_build'
          ? t('nordly.notes.sync.status_local')
          : t('nordly.notes.sync.status_signed_out');
      case 'off':
        return t('nordly.notes.sync.status_off');
      case 'paused':
        return status.reason === 'encryption_locked'
          ? t('nordly.notes.sync.status_locked')
          : t('nordly.notes.sync.status_root_missing');
      case 'syncing':
        return t('nordly.notes.sync.status_syncing', { done: status.done, total: status.total });
      case 'error':
        return status.message === 'notes_sync_plaintext_while_encrypted'
          ? t('nordly.notes.sync.plaintext_remote')
          : status.message;
      case 'synced':
        return status.encrypted
          ? t('nordly.notes.sync.status_synced_encrypted')
          : t('nordly.notes.sync.status_synced');
      default:
        return '';
    }
  })();

  return (
    <>
      <SettingsGroup title={t('nordly.settings.section.sync')}>
        <SettingRow
          label={t('nordly.notes.sync.toggle')}
          hint={statusText}
          highlighted={highlight === SettingsHighlightId.NotesSync}
        >
          <Toggle
            value={enabled}
            disabled={localBuild || busy}
            onChange={(next) => {
              if (next) void turnOn();
              else setConfirmOff(true);
            }}
            label={enabled ? t('nordly.settings.vault.on') : t('nordly.settings.vault.off')}
          />
        </SettingRow>
        {signedOut ? (
          <SettingRow label={t('nordly.notes.sync.sign_in_label')} hint={t('nordly.notes.sync.sign_in_hint')}>
            <button type="button" className="nordly-settings-vault-btn" onClick={() => void turnOn()}>
              {t('nordly.notes.sync.sign_in')}
            </button>
          </SettingRow>
        ) : null}
        <SettingRow label={t('nordly.settings.files_links.vault_folder')} hint={folder ?? t('nordly.settings.files_links.vault_unset')}>
          <button
            type="button"
            className="nordly-settings-vault-btn"
            onClick={() => openSettings({ section: SettingsSectionId.FilesLinks })}
          >
            {t('nordly.notes.sync.open_folder_settings')}
          </button>
        </SettingRow>
        {error ? <p className="nordly-vault-modal__error mono">{error}</p> : null}
      </SettingsGroup>

      <VaultSection syncEnabled={enabled} />

      {wizard ? (
        <EnableNotesSyncWizard
          onClose={() => setWizard(false)}
          onEnabled={() => setWizard(false)}
          onChooseOtherFolder={() => {
            setWizard(false);
            openSettings({ section: SettingsSectionId.FilesLinks });
          }}
        />
      ) : null}

      {confirmOff ? (
        <div className="nordly-vault-modal-backdrop fadein" onClick={() => { if (!busy) setConfirmOff(false); }}>
          <div
            className="nordly-vault-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="nordly-vault-modal__title">{t('nordly.notes.sync.disable_title')}</h2>
            <p className="nordly-vault-modal__body">{t('nordly.notes.sync.disable_body')}</p>
            <div className="nordly-vault-modal__actions">
              <button type="button" className="nordly-vault-modal__secondary" disabled={busy} onClick={() => setConfirmOff(false)}>
                {t('nordly.notes.sync.cancel')}
              </button>
              <button type="button" className="nordly-vault-modal__primary" disabled={busy} onClick={() => void turnOff()}>
                {t('nordly.notes.sync.disable_action')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
