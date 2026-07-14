import { useT } from '@nordly-i18n';

import type { NoteSummary } from '@features/notes/api/notesClient';
import { isNoteVaultLocked } from '@features/notes/api/notesClient';
import { Icon } from '@shared/ui/primitives/Icon';

interface NoteInsertPreviewProps {
  note: NoteSummary;
  nested?: boolean;
}

/** In-list preview of where the dragged note would land (mirrors Today insert slot). */
export function NoteInsertPreview({ note, nested = false }: NoteInsertPreviewProps): JSX.Element {
  const t = useT();
  const vaultLocked = isNoteVaultLocked(note);
  const label = vaultLocked
    ? t('nordly.notes.vault_locked_list')
    : note.title || t('nordly.notes.untitled');

  return (
    <div
      className="nordly-note-insert-preview"
      data-nested={nested ? 'true' : 'false'}
      aria-hidden
    >
      <div className="nordly-note-row-wrap" data-active="false">
        <span className="nordly-note-row__icon" aria-hidden>
          <Icon name={vaultLocked ? 'lock' : 'file'} size={16} strokeWidth={1.5} />
        </span>
        <span className="nordly-note-row__label">{label}</span>
      </div>
    </div>
  );
}
