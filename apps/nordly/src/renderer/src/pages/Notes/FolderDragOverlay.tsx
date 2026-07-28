import type { NoteFolder } from '@features/notes/api/notesClient';
import { Icon } from '@shared/ui/primitives/Icon';

interface FolderDragOverlayProps {
  folder: NoteFolder | null;
}

/** Ghost clone for DragOverlay — mirrors note ghost (tilt + shadow). */
export function FolderDragOverlay({ folder }: FolderDragOverlayProps): JSX.Element | null {
  if (!folder) return null;

  return (
    <div className="nordly-note-row-wrap nordly-folder-row nordly-note-row--ghost" data-active="false">
      <span className="nordly-note-row__icon nordly-folder-row__chevron" aria-hidden>
        <Icon name="chevron-right" size={14} strokeWidth={1.6} />
      </span>
      <span className="nordly-note-row__icon" aria-hidden>
        <Icon name="folder" size={16} strokeWidth={1.5} />
      </span>
      <span className="nordly-note-row__label">{folder.name}</span>
    </div>
  );
}
