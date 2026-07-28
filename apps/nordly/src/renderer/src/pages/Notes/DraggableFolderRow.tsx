import { memo, useMemo, type HTMLAttributes } from 'react';
import { useDraggable } from '@dnd-kit/core';

import { FolderRow, type FolderRowProps } from './FolderRow';
import { folderDraggableId, type FolderDragData } from './noteDnd';

export interface DraggableFolderRowProps extends FolderRowProps {
  dragDisabled?: boolean;
  /** Keep origin slot hidden after preview remount mid-drag. */
  forceDragging?: boolean;
}

export const DraggableFolderRow = memo(function DraggableFolderRow({
  folder,
  dragDisabled,
  forceDragging = false,
  menuOpen,
  renaming,
  ...rowProps
}: DraggableFolderRowProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: folderDraggableId(folder.id),
    disabled: dragDisabled || menuOpen || renaming,
    data: { type: 'folder', folder } satisfies FolderDragData,
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
      <FolderRow
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
