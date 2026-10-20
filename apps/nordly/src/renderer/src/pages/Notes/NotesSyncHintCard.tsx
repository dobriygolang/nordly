import { useT } from '@nordly-i18n';

import { dismissNotesSyncHint, isNotesSyncHintDismissed } from '@features/notes/api/notesSync';
import { useNotesSyncStatus } from '@features/notes/hooks/useNotesSyncStatus';
import { isCloudEnabled } from '@shared/model/features';
import { openSettings, SettingsHighlightId, SettingsSectionId } from '@shared/model/settingsNav';

export function NotesSyncHintCard() {
  const t = useT();
  const status = useNotesSyncStatus();
  const show =
    isCloudEnabled() &&
    (status.kind === 'off' || (status.kind === 'unavailable' && status.reason === 'signed_out'));
  if (!show || isNotesSyncHintDismissed()) return null;

  return (
    <div className="nordly-sync-banner nordly-notes-sync-hint" role="status">
      <p className="nordly-sync-banner__text">{t('nordly.notes.sync.hint')}</p>
      <div className="nordly-sync-banner__actions">
        <button
          type="button"
          className="nordly-sync-banner__btn"
          onClick={() =>
            openSettings({
              section: SettingsSectionId.Sync,
              highlight: SettingsHighlightId.NotesSync,
            })
          }
        >
          {t('nordly.notes.sync.hint_enable')}
        </button>
        <button
          type="button"
          className="nordly-sync-banner__btn"
          onClick={() => {
            void dismissNotesSyncHint().catch((err: unknown) => {
              console.warn('[nordly:notes] dismiss sync hint failed', err);
            });
          }}
        >
          {t('nordly.notes.sync.hint_later')}
        </button>
      </div>
    </div>
  );
}
