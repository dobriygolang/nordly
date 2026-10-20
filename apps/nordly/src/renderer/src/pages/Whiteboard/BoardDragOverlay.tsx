import type { BoardFolder, BoardSummary } from '@features/whiteboard/api/whiteboardClient';
import { Icon } from '@shared/ui/primitives/Icon';

export function BoardDragOverlay({ board }: { board: BoardSummary | null }) {
  if (!board) return null;
  return (
    <div className="nordly-note-row-wrap nordly-note-row--ghost" data-active="false">
      <span className="nordly-note-row__icon" aria-hidden>
        <Icon name="grid" size={16} strokeWidth={1.5} />
      </span>
      <span className="nordly-note-row__label">{board.title}</span>
    </div>
  );
}

export function BoardFolderDragOverlay({ folder }: { folder: BoardFolder | null }) {
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
