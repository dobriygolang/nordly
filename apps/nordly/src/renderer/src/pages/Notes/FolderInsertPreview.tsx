import type { ReactNode } from 'react';

import type { NoteFolder } from '@features/notes/api/notesClient';
import { Icon } from '@shared/ui/primitives/Icon';

interface FolderInsertPreviewProps {
  folder: NoteFolder;
  /** Folder row depth (0 = vault root). Same padding as FolderRow. */
  depth?: number;
  open?: boolean;
  children?: ReactNode;
}

/** In-list landing preview — same row chrome and expanded subtree as the source. */
export function FolderInsertPreview({
  folder,
  depth = 0,
  open = false,
  children,
}: FolderInsertPreviewProps): JSX.Element {
  return (
    <div className="nordly-folder-insert-preview" aria-hidden>
      <div
        className="nordly-note-row-wrap nordly-folder-row"
        data-active="false"
        data-open={open ? 'true' : 'false'}
        style={depth > 0 ? { paddingLeft: 10 + depth * 16 } : undefined}
      >
        <span className="nordly-note-row__icon nordly-folder-row__chevron" aria-hidden>
          <Icon name="chevron-right" size={14} strokeWidth={1.6} />
        </span>
        <span className="nordly-note-row__icon" aria-hidden>
          <Icon name="folder" size={16} strokeWidth={1.5} />
        </span>
        <span className="nordly-note-row__label">{folder.name}</span>
      </div>
      {open ? children : null}
    </div>
  );
}
