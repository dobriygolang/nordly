import { useT } from '@nordly-i18n';

import type { NoteSummary } from '@features/notes/api/notesClient';
import { isNoteVaultLocked } from '@features/notes/api/notesClient';
import { Icon } from '@shared/ui/primitives/Icon';

interface NoteDragOverlayProps {
  note: NoteSummary | null;
}

/** Ghost clone for DragOverlay — mirrors Today task ghost (tilt + shadow). */
export function NoteDragOverlay({ note }: NoteDragOverlayProps): JSX.Element | null {
  const t = useT();
  if (!note) return null;

  const vaultLocked = isNoteVaultLocked(note);
  const label = vaultLocked
    ? t('nordly.notes.vault_locked_list')
    : note.title || t('nordly.notes.untitled');

  return (
    <div className="nordly-note-row-wrap nordly-note-row--ghost" data-active="false">
      <span className="nordly-note-row__icon" aria-hidden>
        <Icon name={vaultLocked ? 'lock' : 'file'} size={16} strokeWidth={1.5} />
      </span>
      <span className="nordly-note-row__label">{label}</span>
    </div>
  );
}
