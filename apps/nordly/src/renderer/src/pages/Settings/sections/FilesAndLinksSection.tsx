import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  isNotesVaultBound,
  revokeVaultImageCache,
  vaultClearConfig,
  vaultGetConfig,
  vaultPickFolder,
  vaultSetConfig,
  vaultStartWatch,
  vaultStopWatch,
  type NotesVaultConfig,
} from '@features/notes/vault';
import {
  refreshNotesVaultBoundCache,
  setNotesVaultBoundCache,
} from '@features/notes/api/notesClient';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { isTauriRuntime } from '@platform/runtime';
import { errorMessage } from '../../Notes/utils';

import { SettingRow, SettingsGroup } from '../primitives/SettingRow';

function displayVaultPath(path: string): string {
  if (path.length <= 52) return path;
  return `…${path.slice(-50)}`;
}

export function FilesAndLinksSection() {
  const t = useT();
  const [cfg, setCfg] = useState<NotesVaultConfig | null>(null);
  const [attachmentDraft, setAttachmentDraft] = useState('img');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!isTauriRuntime()) {
      setCfg(null);
      return;
    }
    const next = await vaultGetConfig();
    setCfg(next);
    setAttachmentDraft(next?.attachmentFolder ?? 'img');
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const changeVault = useCallback(async () => {
    if (cfg && !window.confirm(t('nordly.settings.files_links.change_confirm'))) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const folder = await vaultPickFolder();
      if (!folder) return;
      const next = await vaultSetConfig({
        root: folder,
        attachmentFolder: attachmentDraft.trim() || 'img',
        migratedFromIdb: cfg?.migratedFromIdb ?? false,
      });
      setCfg(next);
      setNotesVaultBoundCache(true);
      await refreshNotesVaultBoundCache();
      revokeVaultImageCache();
      await vaultStopWatch();
      await vaultStartWatch();
      window.dispatchEvent(new Event(NORDLY_EVENTS.notesChanged));
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }, [attachmentDraft, cfg, t]);

  const saveAttachmentFolder = useCallback(async () => {
    if (!cfg) return;
    setBusy(true);
    setError(null);
    try {
      const folder = attachmentDraft.trim() || 'img';
      const next = await vaultSetConfig({
        ...cfg,
        attachmentFolder: folder,
      });
      setCfg(next);
      setAttachmentDraft(next.attachmentFolder);
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }, [attachmentDraft, cfg, t]);

  const clearVault = useCallback(async () => {
    if (!window.confirm(t('nordly.settings.files_links.clear_confirm'))) return;
    setBusy(true);
    setError(null);
    try {
      await vaultStopWatch();
      await vaultClearConfig();
      setCfg(null);
      setNotesVaultBoundCache(false);
      await refreshNotesVaultBoundCache();
      revokeVaultImageCache();
      window.dispatchEvent(new Event(NORDLY_EVENTS.notesChanged));
    } catch (err) {
      setError(errorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }, [t]);

  if (!isTauriRuntime()) {
    return <p className="nordly-settings-empty mono">{t('nordly.notes.vault_onboarding.desktop_only')}</p>;
  }

  return (
    <>
      <SettingsGroup title={t('nordly.settings.section.files_links')}>
        <SettingRow
          label={t('nordly.settings.files_links.vault_folder')}
          hint={
            cfg?.root
              ? displayVaultPath(cfg.root)
              : t('nordly.settings.files_links.vault_unset')
          }
        >
          <button
            type="button"
            className="nordly-settings-change-btn focus-ring"
            disabled={busy}
            onClick={() => void changeVault()}
          >
            {cfg
              ? t('nordly.settings.files_links.change_vault')
              : t('nordly.settings.files_links.choose_vault')}
          </button>
        </SettingRow>
        <SettingRow
          label={t('nordly.settings.files_links.attachment_folder')}
          hint={t('nordly.settings.files_links.attachment_folder_hint')}
        >
          <div className="nordly-settings-inline-control">
            <input
              className="nordly-settings-text-input focus-ring mono"
              value={attachmentDraft}
              disabled={busy || !cfg}
              placeholder={t('nordly.settings.files_links.attachment_placeholder')}
              onChange={(e) => setAttachmentDraft(e.target.value)}
              aria-label={t('nordly.settings.files_links.attachment_folder')}
            />
            <button
              type="button"
              className="nordly-settings-change-btn focus-ring"
              disabled={busy || !cfg}
              onClick={() => void saveAttachmentFolder()}
            >
              {t('nordly.settings.files_links.save')}
            </button>
          </div>
        </SettingRow>
        {cfg ? (
          <SettingRow
            label={t('nordly.settings.files_links.clear_vault')}
            hint={t('nordly.settings.files_links.clear_vault_hint')}
          >
            <button
              type="button"
              className="nordly-settings-change-btn nordly-settings-change-btn--danger focus-ring"
              disabled={busy}
              onClick={() => void clearVault()}
            >
              {t('nordly.settings.files_links.clear_vault_action')}
            </button>
          </SettingRow>
        ) : null}
      </SettingsGroup>
      {error ? <p className="mono nordly-settings-inline-error">{error}</p> : null}
      <BoundProbe onNeedReload={reload} />
    </>
  );
}

function BoundProbe({ onNeedReload }: { onNeedReload: () => void }) {
  useEffect(() => {
    void isNotesVaultBound().then((bound) => {
      if (!bound) onNeedReload();
    });
  }, [onNeedReload]);
  return null;
}
