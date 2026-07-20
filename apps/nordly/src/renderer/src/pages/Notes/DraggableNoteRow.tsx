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
  /** Folder nesting depth (0 = top-level folder). Used for indent. */
  depth?: number;
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
  depth = 0,
  dragDisabled,
  menuOpen,
  ...rowProps
}: DraggableNoteRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: note.id,
    disabled: dragDisabled || menuOpen,
    data: { type: 'note', note } satisfies NoteDragData,
  });
  const {
    role,
    tabIndex,
    'aria-disabled': ariaDisabled,
    'aria-pressed': ariaPressed,
    'aria-roledescription': ariaRoleDescription,
    'aria-describedby': ariaDescribedBy,
  } = attributes;

  const dragHandleProps = useMemo<HTMLAttributes<HTMLElement>>(
    () => ({
      role,
      tabIndex,
      'aria-disabled': ariaDisabled,
      'aria-pressed': ariaPressed,
      'aria-roledescription': ariaRoleDescription,
      'aria-describedby': ariaDescribedBy,
      ...listeners,
    }),
    [role, tabIndex, ariaDisabled, ariaPressed, ariaRoleDescription, ariaDescribedBy, listeners],
  );

  return (
    <div
      ref={setNodeRef}
      className={`nordly-note-row-slot${isDragging ? ' nordly-note-row-slot--dragging' : ''}`}
      data-nested={nested ? 'true' : 'false'}
      data-depth={depth}
      style={
        nested
          ? { ['--note-nest-pad' as string]: `${28 + depth * 16}px` }
          : undefined
      }
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
