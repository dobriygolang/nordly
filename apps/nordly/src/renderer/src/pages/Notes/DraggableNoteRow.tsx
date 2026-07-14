import { memo, useMemo, type HTMLAttributes } from 'react';
import { useDraggable } from '@dnd-kit/core';

import type { NoteSummary, PublishStatus, PublishToWebOptions } from '@features/notes/api/notesClient';

import type { NoteDragData } from './noteDnd';
import { NoteRow } from './NoteRow';

export interface DraggableNoteRowProps {
  note: NoteSummary;
  active: boolean;
  menuOpen: boolean;
  nested: boolean;
  dragDisabled?: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onPublish: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUpdatePublishOptions: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUnpublish: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const DraggableNoteRow = memo(function DraggableNoteRow({
  note,
  nested,
  dragDisabled,
  menuOpen,
  ...rowProps
}: DraggableNoteRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: note.id,
    disabled: dragDisabled || menuOpen,
    data: { type: 'note', note } satisfies NoteDragData,
  });

  const dragHandleProps = useMemo<HTMLAttributes<HTMLElement>>(
    () => ({ ...attributes, ...listeners }),
    [
      listeners,
      attributes.role,
      attributes.tabIndex,
      attributes['aria-disabled'],
      attributes['aria-pressed'],
      attributes['aria-roledescription'],
      attributes['aria-describedby'],
    ],
  );

  return (
    <div
      ref={setNodeRef}
      className={`nordly-note-row-slot${isDragging ? ' nordly-note-row-slot--dragging' : ''}`}
      data-nested={nested ? 'true' : 'false'}
    >
      <NoteRow
        note={note}
        menuOpen={menuOpen}
        dragging={isDragging}
        dragHandleProps={dragHandleProps}
        {...rowProps}
      />
    </div>
  );
});
