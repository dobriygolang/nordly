import { useT } from '@nordly-i18n';

import { useNotesSyncStatus } from '@features/notes/hooks/useNotesSyncStatus';
import { openSettings, SettingsSectionId } from '@shared/model/settingsNav';

export function NotesSyncStatusLine() {
  const t = useT();
  const status = useNotesSyncStatus();

  if (status.kind === 'unavailable' && status.reason === 'local_build') return null;

  let text = t('nordly.notes.sync.status_off');
  let openUnlock = false;
  switch (status.kind) {
    case 'off':
    case 'unavailable':
      text = t('nordly.notes.sync.status_off');
      break;
    case 'syncing':
      text = t('nordly.notes.sync.status_syncing', { done: status.done, total: status.total });
      break;
    case 'synced': {
      const when = status.at ? formatAgo(status.at, t) : t('nordly.notes.sync.status_on');
      text = status.encrypted
        ? t('nordly.notes.sync.status_synced_encrypted_when', { when })
        : t('nordly.notes.sync.status_synced_when', { when });
      break;
    }
    case 'paused':
      text = status.reason === 'encryption_locked'
        ? t('nordly.notes.sync.status_locked')
        : t('nordly.notes.sync.status_root_missing');
      openUnlock = status.reason === 'encryption_locked';
      break;
    case 'error':
      text = status.message === 'notes_sync_plaintext_while_encrypted'
        ? t('nordly.notes.sync.plaintext_remote')
        : status.message;
      break;
    default:
      break;
  }

  if (openUnlock) {
    return (
      <button
        type="button"
        className="nordly-notes-sync-status nordly-notes-sync-status__link mono"
        onClick={() => openSettings({ section: SettingsSectionId.Sync })}
      >
        {text}
      </button>
    );
  }

  return <p className="nordly-notes-sync-status mono">{text}</p>;
}

function formatAgo(at: Date, t: (key: string, params?: Record<string, string | number>) => string): string {
  const minutes = Math.max(0, Math.round((Date.now() - at.getTime()) / 60000));
  if (minutes < 1) return t('nordly.notes.sync.just_now');
  if (minutes < 60) return t('nordly.notes.sync.minutes_ago', { minutes });
  const hours = Math.round(minutes / 60);
  return t('nordly.notes.sync.hours_ago', { hours });
}
