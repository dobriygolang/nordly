import { memo, useMemo, type HTMLAttributes } from 'react';
import { useDraggable } from '@dnd-kit/core';

import type { BoardSummary } from '@features/whiteboard/api/whiteboardClient';

import { BoardRow, type BoardRowProps } from './BoardRow';

export interface DraggableBoardRowProps extends Omit<BoardRowProps, 'dragging' | 'dragHandleProps'> {
  nested: boolean;
  depth?: number;
  dragDisabled?: boolean;
  forceDragging?: boolean;
}

export const DraggableBoardRow = memo(function DraggableBoardRow({
  board,
  nested,
  depth = 0,
  dragDisabled,
  menuOpen,
  forceDragging = false,
  ...rowProps
}: DraggableBoardRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: board.id,
    disabled: dragDisabled || menuOpen,
    data: { type: 'board', board } satisfies { type: 'board'; board: BoardSummary },
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

  const hiding = isDragging || forceDragging;

  return (
    <div
      ref={setNodeRef}
      className={`nordly-note-row-slot${hiding ? ' nordly-note-row-slot--dragging' : ''}`}
      data-nested={nested ? 'true' : 'false'}
      data-depth={depth}
      style={nested ? { ['--note-nest-pad' as string]: `${28 + depth * 16}px` } : undefined}
    >
      <BoardRow
        board={board}
        menuOpen={menuOpen}
        dragging={hiding}
        dragHandleProps={dragHandleProps}
        {...rowProps}
      />
    </div>
  );
});
