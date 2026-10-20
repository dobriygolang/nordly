import { useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';

import type { BoardFolder, BoardSummary } from '@features/whiteboard/api/whiteboardClient';
import { Icon } from '@shared/ui/primitives/Icon';
import {
  UNFILED_DROPPABLE_ID,
  folderDroppableId,
  type BoardDropData,
} from './boardDnd';

import { DraggableBoardFolderRow } from './DraggableBoardFolderRow';
import { DraggableBoardRow } from './DraggableBoardRow';

function RootDropZone({
  children,
  enabled,
  dropActive,
}: {
  children: React.ReactNode;
  enabled: boolean;
  dropActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: UNFILED_DROPPABLE_ID,
    disabled: !enabled,
    data: { type: 'unfiled' } satisfies BoardDropData,
  });

  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={setNodeRef}
      className="nordly-notes-root-drop"
      data-drop-active={isOver || dropActive ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}

function FolderDropZone({
  folderId,
  disabled,
  previewChildren,
  previewActive,
  open,
  onHoverOpen,
  header,
  children,
  dragging = false,
  previewing = false,
}: {
  folderId: string;
  disabled: boolean;
  previewChildren: React.ReactNode;
  previewActive: boolean;
  open: boolean;
  onHoverOpen: (folderId: string) => void;
  header: React.ReactNode;
  children: React.ReactNode;
  dragging?: boolean;
  previewing?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: folderDroppableId(folderId),
    disabled,
    data: { type: 'folder', folderId } satisfies BoardDropData,
  });

  useEffect(() => {
    if (previewActive) onHoverOpen(folderId);
  }, [previewActive, folderId, onHoverOpen]);

  return (
    <div
      ref={setNodeRef}
      className={`nordly-folder-group nordly-folder-drop${dragging ? ' nordly-folder-group--dragging' : ''}${previewing ? ' nordly-folder-group--previewing' : ''}`}
      data-drop-active={isOver || previewActive ? 'true' : 'false'}
    >
      {header}
      {open ? (previewActive ? previewChildren : children) : null}
    </div>
  );
}

function BoardInsertPreview({
  board,
  nested,
  depth,
}: {
  board: BoardSummary;
  nested: boolean;
  depth: number;
}) {
  return (
    <div
      className="nordly-note-insert-preview"
      data-nested={nested ? 'true' : 'false'}
      data-depth={depth}
      style={nested ? { ['--note-nest-pad' as string]: `${28 + depth * 16}px` } : undefined}
      aria-hidden
    >
      <div className="nordly-note-row-wrap" data-active="false">
        <span className="nordly-note-row__icon" aria-hidden>
          <Icon name="grid" size={16} strokeWidth={1.5} />
        </span>
        <span className="nordly-note-row__label">{board.title}</span>
      </div>
    </div>
  );
}

function FolderInsertPreview({
  folder,
  depth = 0,
  open = false,
  children,
}: {
  folder: BoardFolder;
  depth?: number;
  open?: boolean;
  children?: React.ReactNode;
}) {
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

export interface BoardFolderTreeProps {
  folders: BoardFolder[];
  boards: BoardSummary[];
  openFolderIds: Set<string>;
  renamingId: string | null;
  selectedId: string | null;
  openMenuId: string | null;
  cloudEnabled: boolean;
  activeBoard: BoardSummary | null;
  activeFolder: BoardFolder | null;
  previewFolderId: string | null | undefined;
  folderDropBlockedIds: Set<string> | null;
  onHoverOpen: (folderId: string) => void;
  onToggleFolder: (id: string) => void;
  onSelect: (id: string) => void;
  onMenuOpenChange: (id: string, open: boolean) => void;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onCommitFolderRename: (id: string, name: string) => void;
  onCreateBoard: (folderId: string) => void;
  onCreateFolder: (parentId: string) => void;
  onDeleteFolder: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onShare: () => void;
  onPublish: () => void;
  onDelete: (id: string) => Promise<void>;
}

export function BoardFolderTree({
  folders,
  boards,
  openFolderIds,
  renamingId,
  selectedId,
  openMenuId,
  cloudEnabled,
  activeBoard,
  activeFolder,
  previewFolderId,
  folderDropBlockedIds,
  onHoverOpen,
  onToggleFolder,
  onSelect,
  onMenuOpenChange,
  onStartRename,
  onCancelRename,
  onCommitFolderRename,
  onCreateBoard,
  onCreateFolder,
  onDeleteFolder,
  onRename,
  onShare,
  onPublish,
  onDelete,
}: BoardFolderTreeProps) {
  const folderIds = new Set(folders.map((folder) => folder.id));
  const hasFolders = folders.length > 0;
  const childrenByParent = new Map<string | null, BoardFolder[]>();
  for (const folder of folders) {
    const parent = folder.parentId && folderIds.has(folder.parentId) ? folder.parentId : null;
    const list = childrenByParent.get(parent) ?? [];
    list.push(folder);
    childrenByParent.set(parent, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  const boardsByFolder = new Map<string | null, BoardSummary[]>();
  for (const board of boards) {
    const parent = board.folderId && folderIds.has(board.folderId) ? board.folderId : null;
    const list = boardsByFolder.get(parent) ?? [];
    list.push(board);
    boardsByFolder.set(parent, list);
  }

  const activeBoardFolderId =
    activeBoard?.folderId && folderIds.has(activeBoard.folderId) ? activeBoard.folderId : null;
  const activeFolderParentId = activeFolder
    ? activeFolder.parentId && folderIds.has(activeFolder.parentId)
      ? activeFolder.parentId
      : null
    : undefined;

  const renderBoard = (board: BoardSummary, nested: boolean, depth: number) => (
    <DraggableBoardRow
      key={board.id}
      board={board}
      nested={nested}
      depth={depth}
      active={selectedId === board.id}
      cloudEnabled={cloudEnabled}
      menuOpen={openMenuId === board.id}
      renaming={renamingId === board.id}
      dragDisabled={!hasFolders}
      forceDragging={activeBoard?.id === board.id}
      onMenuOpenChange={(open) => onMenuOpenChange(board.id, open)}
      onSelect={onSelect}
      onStartRename={onStartRename}
      onCancelRename={onCancelRename}
      onRename={onRename}
      onShare={onShare}
      onPublish={onPublish}
      onDelete={onDelete}
    />
  );

  const renderFolderInsertPreview = (folder: BoardFolder, depth: number): React.ReactNode => {
    const open = openFolderIds.has(folder.id);
    const childBoards = boardsByFolder.get(folder.id) ?? [];
    const childFolders = childrenByParent.get(folder.id) ?? [];
    return (
      <FolderInsertPreview key={`preview:folder:${folder.id}`} folder={folder} depth={depth} open={open}>
        {childBoards.map((board) => (
          <BoardInsertPreview key={`preview:board:${board.id}`} board={board} nested depth={depth} />
        ))}
        {childFolders.map((child) => renderFolderInsertPreview(child, depth + 1))}
      </FolderInsertPreview>
    );
  };

  const renderDropPreview = (
    rows: BoardSummary[],
    nested: boolean,
    targetFolderId: string | null,
    depth: number,
  ): React.ReactNode => {
    const rendered = rows.map((board) => renderBoard(board, nested, depth));
    if (activeBoard) {
      if (activeBoardFolderId !== targetFolderId) {
        return [
          <BoardInsertPreview
            key={`preview:${targetFolderId ?? 'unfiled'}`}
            board={activeBoard}
            nested={nested}
            depth={depth}
          />,
          ...rendered,
        ];
      }
      return rows.map((board) =>
        board.id === activeBoard.id ? (
          <div className="nordly-note-drag-origin" key={`preview:${board.id}`}>
            {renderBoard(board, nested, depth)}
            <BoardInsertPreview board={activeBoard} nested={nested} depth={depth} />
          </div>
        ) : (
          renderBoard(board, nested, depth)
        ),
      );
    }
    if (activeFolder && activeFolderParentId !== targetFolderId) {
      return [renderFolderInsertPreview(activeFolder, nested ? depth + 1 : 0), ...rendered];
    }
    return rendered;
  };

  const renderIdleRows = (
    rows: BoardSummary[],
    nested: boolean,
    containerFolderId: string | null,
    depth: number,
  ): React.ReactNode =>
    rows
      .filter(
        (board) =>
          !activeBoard ||
          board.id !== activeBoard.id ||
          activeBoardFolderId !== containerFolderId ||
          previewFolderId === containerFolderId,
      )
      .map((board) => renderBoard(board, nested, depth));

  const renderFolderTree = (folderList: BoardFolder[], depth: number): React.ReactNode =>
    folderList.map((folder) => {
      const open = openFolderIds.has(folder.id) || renamingId === folder.id;
      const childBoards = boardsByFolder.get(folder.id) ?? [];
      const childFolders = childrenByParent.get(folder.id) ?? [];
      const folderDragging = activeFolder?.id === folder.id;
      const dropDisabled = renamingId === folder.id || Boolean(folderDropBlockedIds?.has(folder.id));
      const parentId = folder.parentId && folderIds.has(folder.parentId) ? folder.parentId : null;
      const sameParentOrigin = folderDragging && activeFolder != null && previewFolderId === parentId;

      return (
        <FolderDropZone
          key={folder.id}
          folderId={folder.id}
          disabled={dropDisabled}
          dragging={folderDragging}
          previewing={sameParentOrigin}
          previewChildren={
            <>
              {renderDropPreview(childBoards, true, folder.id, depth)}
              {renderFolderTree(childFolders, depth + 1)}
            </>
          }
          previewActive={(activeBoard != null || activeFolder != null) && previewFolderId === folder.id}
          open={open}
          onHoverOpen={onHoverOpen}
          header={
            <DraggableBoardFolderRow
              folder={folder}
              open={open}
              depth={depth}
              menuOpen={openMenuId === folder.id}
              renaming={renamingId === folder.id}
              forceDragging={folderDragging}
              onMenuOpenChange={(menuOpen) => onMenuOpenChange(folder.id, menuOpen)}
              onToggle={onToggleFolder}
              onStartRename={onStartRename}
              onCancelRename={onCancelRename}
              onCommitRename={onCommitFolderRename}
              onCreateBoard={onCreateBoard}
              onCreateFolder={onCreateFolder}
              onDelete={onDeleteFolder}
            />
          }
        >
          {open ? (
            <>
              {renderIdleRows(childBoards, true, folder.id, depth)}
              {renderFolderTree(childFolders, depth + 1)}
            </>
          ) : null}
        </FolderDropZone>
      );
    });

  const rootBoards = boardsByFolder.get(null) ?? [];
  const rootFolders = childrenByParent.get(null) ?? [];

  return (
    <RootDropZone
      enabled={hasFolders}
      dropActive={(activeBoard != null || activeFolder != null) && previewFolderId === null}
    >
      {previewFolderId === null && (activeBoard != null || activeFolder != null)
        ? renderDropPreview(rootBoards, false, null, 0)
        : renderIdleRows(rootBoards, false, null, 0)}
      {renderFolderTree(rootFolders, 0)}
    </RootDropZone>
  );
}
