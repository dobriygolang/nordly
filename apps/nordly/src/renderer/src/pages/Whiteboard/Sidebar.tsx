import '@shared/ui/VaultRowMenu.css';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { useT } from '@nordly-i18n';

import {
  boardFolderSubtreeIds,
  type BoardFolder,
  type BoardSummary,
} from '@features/whiteboard/api/whiteboardClient';
import { Icon } from '@shared/ui/primitives/Icon';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { noteMenuPos } from '@shared/lib/noteMenuPos';
import { useVaultRowMenuDismiss } from '@shared/lib/useVaultRowMenuDismiss';
import {
  boardCollisionDetection,
  parseFolderDraggableId,
  resolveDropFolderId,
} from './boardDnd';

import { BoardDragOverlay, BoardFolderDragOverlay } from './BoardDragOverlay';
import { BoardFolderTree } from './BoardFolderTree';
import { type ListState } from './utils';

const dropAnimation = {
  duration: 200,
  easing: 'ease-out',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.5' } },
  }),
};

const CREATE_MENU_W = 180;

export interface SidebarProps {
  list: ListState;
  folders: BoardFolder[];
  selectedId: string | null;
  cloudEnabled: boolean;
  onSelect: (id: string) => void;
  onCreate: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => Promise<BoardFolder>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  onRename: (id: string, title: string) => Promise<void>;
  onMove: (id: string, folderId: string | null) => Promise<void>;
  onMoveFolder: (id: string, parentId: string | null) => Promise<void>;
  onShare: () => void;
  onPublish: () => void;
  onDelete: (id: string) => Promise<void>;
}

export const Sidebar = memo(function Sidebar({
  list,
  folders,
  selectedId,
  cloudEnabled,
  onSelect,
  onCreate,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onRename,
  onMove,
  onMoveFolder,
  onShare,
  onPublish,
  onDelete,
}: SidebarProps) {
  const t = useT();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(() => new Set());
  const [activeBoard, setActiveBoard] = useState<BoardSummary | null>(null);
  const [activeFolder, setActiveFolder] = useState<BoardFolder | null>(null);
  const [previewFolderId, setPreviewFolderId] = useState<string | null | undefined>(undefined);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPos, setCreateMenuPos] = useState<{ top: number; right: number } | null>(null);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const createRowRef = useRef<HTMLDivElement>(null);

  const closeCreateMenu = useCallback(() => setCreateMenuOpen(false), []);
  const updateCreateMenuPos = useCallback(() => {
    const el = createBtnRef.current;
    if (!el) return;
    setCreateMenuPos(noteMenuPos(el.getBoundingClientRect(), CREATE_MENU_W));
  }, []);
  useVaultRowMenuDismiss(createMenuOpen, closeCreateMenu, createRowRef, createMenuRef, updateCreateMenuPos);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!activeBoard && !activeFolder) {
      document.body.classList.remove('nordly-note-dragging');
      return;
    }
    document.body.classList.add('nordly-note-dragging');
    return () => {
      document.body.classList.remove('nordly-note-dragging');
    };
  }, [activeBoard, activeFolder]);

  const folderDropBlockedIds = useMemo(() => {
    if (!activeFolder) return null;
    return new Set(boardFolderSubtreeIds(folders, activeFolder.id));
  }, [activeFolder, folders]);

  const revealFolder = useCallback((folderId: string) => {
    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      let current: string | null = folderId;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        seen.add(current);
        next.add(current);
        current = folders.find((folder) => folder.id === current)?.parentId ?? null;
      }
      return next;
    });
  }, [folders]);

  const moveBoard = useCallback(
    async (id: string, folderId: string | null) => {
      await onMove(id, folderId);
      if (folderId) revealFolder(folderId);
    },
    [onMove, revealFolder],
  );

  const createBoardIn = useCallback(
    (folderId: string | null) => {
      if (folderId) revealFolder(folderId);
      onCreate(folderId);
    },
    [onCreate, revealFolder],
  );

  const createFolderIn = useCallback(
    async (parentId: string | null) => {
      try {
        const folder = await onCreateFolder(parentId);
        if (parentId) revealFolder(parentId);
        revealFolder(folder.id);
        setRenamingId(folder.id);
        setOpenMenuId(null);
      } catch {
        /* surfaced by WhiteboardPage */
      }
    },
    [onCreateFolder, revealFolder],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setOpenMenuId(null);
      const draggedFolderId = parseFolderDraggableId(String(event.active.id));
      if (draggedFolderId) {
        const folder = folders.find((item) => item.id === draggedFolderId) ?? null;
        setActiveFolder(folder);
        setActiveBoard(null);
        setPreviewFolderId(folder ? (folder.parentId ?? null) : undefined);
        return;
      }
      const board = list.boards.find((item) => item.id === event.active.id) ?? null;
      setActiveBoard(board);
      setActiveFolder(null);
      setPreviewFolderId(board ? (board.folderId ?? null) : undefined);
    },
    [folders, list.boards],
  );

  const handleDragCancel = useCallback(() => {
    setActiveBoard(null);
    setActiveFolder(null);
    setPreviewFolderId(undefined);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const next = resolveDropFolderId(event.over ? String(event.over.id) : null);
    if (next !== undefined) setPreviewFolderId(next);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const next = resolveDropFolderId(event.over ? String(event.over.id) : null);
      const draggedFolderId = parseFolderDraggableId(String(event.active.id));
      setActiveBoard(null);
      setActiveFolder(null);
      setPreviewFolderId(undefined);
      if (next === undefined) return;

      if (draggedFolderId) {
        const folder = folders.find((item) => item.id === draggedFolderId);
        if (!folder || (folder.parentId ?? null) === next) return;
        if (next && boardFolderSubtreeIds(folders, draggedFolderId).includes(next)) return;
        if (next) revealFolder(next);
        void onMoveFolder(draggedFolderId, next);
        return;
      }

      const board = list.boards.find((item) => item.id === String(event.active.id));
      if (!board || (board.folderId ?? null) === next) return;
      void moveBoard(board.id, next);
    },
    [folders, list.boards, moveBoard, onMoveFolder, revealFolder],
  );

  return (
    <aside className="nordly-vault-sidebar">
      <div className="nordly-vault-sidebar__toolbar" ref={createRowRef}>
        <button
          type="button"
          className="nordly-vault-sidebar__btn nordly-icon-btn"
          title={t('nordly.notes.back')}
          onClick={() => window.dispatchEvent(new Event(NORDLY_EVENTS.navHome))}
        >
          <Icon name="chevron-left" size={16} strokeWidth={1.6} />
        </button>
        <span className="nordly-vault-sidebar__label">{t('nordly.whiteboard.sidebar_title')}</span>
        <button
          ref={createBtnRef}
          type="button"
          className="nordly-vault-sidebar__btn nordly-icon-btn"
          title={t('nordly.whiteboard.create_menu')}
          data-open={createMenuOpen ? 'true' : 'false'}
          onClick={() => {
            setCreateMenuOpen((open) => !open);
            setOpenMenuId(null);
          }}
        >
          <Icon name="plus" size={16} strokeWidth={1.8} />
        </button>
      </div>

      {createMenuOpen &&
        createMenuPos &&
        createPortal(
          <div
            ref={createMenuRef}
            className="nordly-note-menu"
            style={{
              position: 'fixed',
              top: createMenuPos.top,
              right: createMenuPos.right,
              width: CREATE_MENU_W,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            <button
              type="button"
              className="nordly-note-menu__item"
              onClick={() => {
                closeCreateMenu();
                createBoardIn(null);
              }}
            >
              <span className="nordly-note-menu__text">{t('nordly.whiteboard.new')}</span>
            </button>
            <button
              type="button"
              className="nordly-note-menu__item"
              onClick={() => {
                closeCreateMenu();
                void createFolderIn(null);
              }}
            >
              <span className="nordly-note-menu__text">{t('nordly.whiteboard.new_folder')}</span>
            </button>
          </div>,
          document.body,
        )}

      <DndContext
        sensors={sensors}
        collisionDetection={boardCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="nordly-vault-sidebar__list">
          <BoardFolderTree
            folders={folders}
            boards={list.boards}
            openFolderIds={openFolderIds}
            renamingId={renamingId}
            selectedId={selectedId}
            openMenuId={openMenuId}
            cloudEnabled={cloudEnabled}
            activeBoard={activeBoard}
            activeFolder={activeFolder}
            previewFolderId={previewFolderId}
            folderDropBlockedIds={folderDropBlockedIds}
            onHoverOpen={revealFolder}
            onToggleFolder={(id) => {
              setOpenFolderIds((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            }}
            onSelect={(id) => {
              setRenamingId(null);
              onSelect(id);
            }}
            onMenuOpenChange={(id, open) => setOpenMenuId(open ? id : null)}
            onStartRename={(id) => {
              setOpenMenuId(null);
              setRenamingId(id);
            }}
            onCancelRename={() => setRenamingId(null)}
            onCommitFolderRename={(id, name) => {
              setRenamingId(null);
              void onRenameFolder(id, name);
            }}
            onCreateBoard={createBoardIn}
            onCreateFolder={(parentId) => {
              void createFolderIn(parentId);
            }}
            onDeleteFolder={(id) => {
              void onDeleteFolder(id);
            }}
            onRename={onRename}
            onShare={onShare}
            onPublish={onPublish}
            onDelete={onDelete}
          />
        </div>
        <DragOverlay dropAnimation={dropAnimation}>
          {activeFolder ? (
            <BoardFolderDragOverlay folder={activeFolder} />
          ) : (
            <BoardDragOverlay board={activeBoard} />
          )}
        </DragOverlay>
      </DndContext>
    </aside>
  );
});
