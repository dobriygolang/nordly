import { memo, useMemo, type HTMLAttributes } from 'react';
import { useDraggable } from '@dnd-kit/core';

import { folderDraggableId } from './boardDnd';

import { BoardFolderRow, type BoardFolderRowProps } from './BoardFolderRow';

export interface DraggableBoardFolderRowProps extends Omit<BoardFolderRowProps, 'dragging' | 'dragHandleProps'> {
  dragDisabled?: boolean;
  forceDragging?: boolean;
}

export const DraggableBoardFolderRow = memo(function DraggableBoardFolderRow({
  folder,
  dragDisabled,
  forceDragging = false,
  menuOpen,
  renaming,
  ...rowProps
}: DraggableBoardFolderRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: folderDraggableId(folder.id),
    disabled: dragDisabled || menuOpen || renaming,
    data: { type: 'folder' as const, folder },
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
      className={`nordly-folder-row-slot${hiding ? ' nordly-folder-row-slot--dragging' : ''}`}
    >
      <BoardFolderRow
        folder={folder}
        menuOpen={menuOpen}
        renaming={renaming}
        dragging={hiding}
        dragHandleProps={dragHandleProps}
        {...rowProps}
      />
    </div>
  );
});
