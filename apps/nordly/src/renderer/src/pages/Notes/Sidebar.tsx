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

import { useDialogSurface } from '@shared/hooks/useDialogSurface';
import { Icon } from '@shared/ui/primitives/Icon';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { noteMenuPos } from '@shared/lib/noteMenuPos';
import { useVaultRowMenuDismiss } from '@shared/lib/useVaultRowMenuDismiss';
import type {
  NoteFolder,
  NoteSummary,
  PublishStatus,
  PublishToWebOptions,
} from '@features/notes/api/notesClient';
import { collectSubtreeIds } from '@features/notes/api/notesClient';
import { FolderDragOverlay } from './FolderDragOverlay';
import { NoteDragOverlay } from './NoteDragOverlay';
import { NotesFolderTree } from './NotesFolderTree';
import {
  parseFolderDraggableId,
  resolveDropFolderId,
  notesCollisionDetection,
} from './noteDnd';
import { type ListState } from './utils';
import { useNotesSidebarSelection } from './useNotesSidebarSelection';

const CREATE_MENU_W = 168;

const dropAnimation = {
  duration: 200,
  easing: 'ease-out',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.5' } },
  }),
};

export interface SidebarProps {
  list: ListState;
  folders: NoteFolder[];
  selectedId: string | null;
  createTargetFolderId: string | null;
  onSelect: (id: string) => void;
  onCreateNote: (folderId?: string | null) => void;
  onCreateFolder: (parentId?: string | null) => Promise<NoteFolder>;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => Promise<void>;
  onMoveNote: (noteId: string, folderId: string | null) => Promise<void>;
  onMoveFolder: (folderId: string, parentId: string | null) => Promise<void>;
  onFocusFolder: (folderId: string | null) => void;
  onPublish: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUpdatePublishOptions: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUnpublish: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDeleteMany: (ids: string[]) => Promise<void>;
  onError?: (message: string) => void;
}

export const Sidebar = memo(function Sidebar({
  list,
  folders,
  selectedId,
  createTargetFolderId,
  onSelect,
  onCreateNote,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveNote,
  onMoveFolder,
  onFocusFolder,
  onPublish,
  onUpdatePublishOptions,
  onUnpublish,
  onDelete,
  onDeleteMany,
  onError,
}: SidebarProps) {
  const t = useT();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPos, setCreateMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<NoteSummary | null>(null);
  const [activeFolder, setActiveFolder] = useState<NoteFolder | null>(null);
  const [previewFolderId, setPreviewFolderId] = useState<string | null | undefined>(undefined);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    folderIds: string[];
    noteIds: string[];
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const listFocusRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const createBtnRef = useRef<HTMLButtonElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const createRowRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  useDialogSurface(deleteDialogRef, () => {
    if (!deleteBusy) setDeleteConfirm(null);
  }, { active: Boolean(deleteConfirm) });

  const sel = useNotesSidebarSelection({
    list,
    folders,
    selectedId,
    onSelect,
    onFocusFolder,
    onDeleteFolder,
    onDeleteMany,
    listFocusRef,
    rootRef,
    renamingFolderId,
    createMenuOpen,
    openMenuId,
    activeNote,
    activeFolder,
    deleteConfirm,
    deleteBusy,
    setDeleteConfirm,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const closeCreateMenu = useCallback(() => setCreateMenuOpen(false), []);

  const updateCreateMenuPos = useCallback(() => {
    const el = createBtnRef.current;
    if (!el) return;
    setCreateMenuPos(noteMenuPos(el.getBoundingClientRect(), CREATE_MENU_W));
  }, []);

  useEffect(() => {
    if (!createMenuOpen) setCreateMenuPos(null);
  }, [createMenuOpen]);

  useVaultRowMenuDismiss(createMenuOpen, closeCreateMenu, createRowRef, createMenuRef, updateCreateMenuPos);

  useEffect(() => {
    if (!activeNote && !activeFolder) {
      document.body.classList.remove('nordly-note-dragging');
      return;
    }
    document.body.classList.add('nordly-note-dragging');
    const clearDrag = () => {
      setActiveNote(null);
      setActiveFolder(null);
      setPreviewFolderId(undefined);
    };
    window.addEventListener('blur', clearDrag);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') clearDrag();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.body.classList.remove('nordly-note-dragging');
      window.removeEventListener('blur', clearDrag);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [activeNote, activeFolder]);

  const deleteConfirmBody = useMemo(() => {
    if (!deleteConfirm) return '';
    const { folderIds, noteIds } = deleteConfirm;
    if (folderIds.length > 0 && noteIds.length > 0) {
      return t('nordly.notes.delete_confirm_body', {
        notes: String(noteIds.length),
        folders: String(folderIds.length),
      });
    }
    if (folderIds.length === 1 && noteIds.length === 0) {
      return t('nordly.notes.delete_confirm_body_one_folder');
    }
    if (folderIds.length > 1 && noteIds.length === 0) {
      return t('nordly.notes.delete_confirm_body_folders', {
        count: String(folderIds.length),
      });
    }
    if (noteIds.length === 1) return t('nordly.notes.delete_confirm_body_one_note');
    return t('nordly.notes.delete_confirm_body_notes', { count: String(noteIds.length) });
  }, [deleteConfirm, t]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setOpenMenuId(null);
      const draggedFolderId = parseFolderDraggableId(String(event.active.id));
      if (draggedFolderId) {
        const folder = folders.find((f) => f.id === draggedFolderId) ?? null;
        setActiveFolder(folder);
        setActiveNote(null);
        setPreviewFolderId(folder ? (folder.parentId ?? null) : undefined);
        return;
      }
      const note = list.notes.find((n) => n.id === event.active.id);
      setActiveNote(note ?? null);
      setActiveFolder(null);
      const folderId = note?.folderId && sel.folderIds.has(note.folderId) ? note.folderId : null;
      setPreviewFolderId(note ? folderId : undefined);
    },
    [folders, list.notes, sel.folderIds],
  );

  const handleDragCancel = useCallback(() => {
    setActiveNote(null);
    setActiveFolder(null);
    setPreviewFolderId(undefined);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    const folderId = resolveDropFolderId(overId);
    if (folderId !== undefined) setPreviewFolderId(folderId);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const overId = event.over ? String(event.over.id) : null;
      const next = resolveDropFolderId(overId);
      const draggedFolderId = parseFolderDraggableId(String(event.active.id));

      if (draggedFolderId) {
        const folder = activeFolder ?? folders.find((f) => f.id === draggedFolderId) ?? null;
        setActiveFolder(null);
        setActiveNote(null);
        setPreviewFolderId(undefined);
        if (next === undefined || !folder) return;

        if (next !== null) {
          const subtree = new Set(collectSubtreeIds(folders, draggedFolderId));
          if (subtree.has(next)) return;
        }

        const current = folder.parentId ?? null;
        if (current === next) return;

        if (next) {
          sel.setOpenFolderIds((prev) => new Set(prev).add(next));
        }
        void onMoveFolder(draggedFolderId, next).catch((err: unknown) => {
          console.warn('[nordly:notes] move folder rejected (NotesPage surfaces UI)', err);
        });
        return;
      }

      setActiveNote(null);
      setActiveFolder(null);
      setPreviewFolderId(undefined);
      if (next === undefined) return;

      const noteId = String(event.active.id);
      const note = list.notes.find((n) => n.id === noteId);
      const current = note?.folderId && sel.folderIds.has(note.folderId) ? note.folderId : null;
      if (current === next) return;

      if (next) {
        sel.setOpenFolderIds((prev) => new Set(prev).add(next));
      }
      void onMoveNote(noteId, next).catch((err: unknown) => {
        console.warn('[nordly:notes] move note rejected (NotesPage surfaces UI)', err);
      });
    },
    [activeFolder, folders, list.notes, onMoveFolder, onMoveNote, sel],
  );

  const openFolderOnHover = useCallback((folderId: string) => {
    sel.setOpenFolderIds((prev) => {
      if (prev.has(folderId)) return prev;
      return new Set(prev).add(folderId);
    });
  }, [sel]);

  const folderDropBlockedIds = useMemo(() => {
    if (!activeFolder) return null;
    return new Set(collectSubtreeIds(folders, activeFolder.id));
  }, [activeFolder, folders]);

  const runDeleteConfirm = useCallback(async () => {
    setDeleteBusy(true);
    try {
      await sel.executeDeleteConfirm();
    } finally {
      setDeleteBusy(false);
    }
  }, [sel]);

  return (
    <aside className="nordly-vault-sidebar" ref={rootRef}>
      <div className="nordly-vault-sidebar__toolbar" ref={createRowRef}>
        <button
          type="button"
          className="nordly-vault-sidebar__btn nordly-icon-btn"
          title={t('nordly.notes.back')}
          onClick={() => window.dispatchEvent(new Event(NORDLY_EVENTS.navHome))}
        >
          <Icon name="chevron-left" size={16} strokeWidth={1.6} />
        </button>
        <span className="nordly-vault-sidebar__label">{t('nordly.notes.sidebar_title')}</span>
        <button
          ref={createBtnRef}
          type="button"
          className="nordly-vault-sidebar__btn nordly-icon-btn"
          title={t('nordly.notes.create_menu')}
          data-open={createMenuOpen ? 'true' : 'false'}
          onClick={() => {
            setCreateMenuOpen((v) => !v);
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
                onCreateNote();
              }}
            >
              <span className="nordly-note-menu__icon" aria-hidden>
                <Icon name="file" size={14} strokeWidth={1.5} />
              </span>
              <span className="nordly-note-menu__text">{t('nordly.notes.new')}</span>
            </button>
            <button
              type="button"
              className="nordly-note-menu__item"
              onClick={() => {
                closeCreateMenu();
                void onCreateFolder()
                  .then((folder) => {
                    setRenamingFolderId(folder.id);
                    sel.setOpenFolderIds((prev) => new Set(prev).add(folder.id));
                  })
                  .catch((err: unknown) => {
                    console.warn('[nordly:notes] create folder rejected (NotesPage surfaces UI)', err);
                  });
              }}
            >
              <span className="nordly-note-menu__icon" aria-hidden>
                <Icon name="folder" size={14} strokeWidth={1.5} />
              </span>
              <span className="nordly-note-menu__text">{t('nordly.notes.new_folder')}</span>
            </button>
          </div>,
          document.body,
        )}

      <DndContext
        sensors={sensors}
        collisionDetection={notesCollisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={listFocusRef}
          className="nordly-vault-sidebar__list"
          tabIndex={-1}
          onMouseDown={(e) => {
            const target = e.target as HTMLElement;
            if (
              target === e.currentTarget ||
              target.classList.contains('nordly-notes-root-drop')
            ) {
              sel.focusList();
              onFocusFolder(null);
              sel.setSelection(new Set());
              sel.anchorIdRef.current = null;
            }
          }}
        >
          <NotesFolderTree
            rootFolders={sel.rootFolders}
            unfiledNotes={sel.unfiledNotes}
            notesByFolder={sel.notesByFolder}
            childrenByParent={sel.childrenByParent}
            folderIds={sel.folderIds}
            hasFolders={sel.hasFolders}
            openFolderIds={sel.openFolderIds}
            renamingFolderId={renamingFolderId}
            selectionIds={sel.selectionIds}
            selectedId={selectedId}
            createTargetFolderId={createTargetFolderId}
            openMenuId={openMenuId}
            activeNote={activeNote}
            activeFolder={activeFolder}
            previewFolderId={previewFolderId}
            folderDropBlockedIds={folderDropBlockedIds}
            onHoverOpen={openFolderOnHover}
            onToggleFolder={sel.toggleFolder}
            onNoteSelect={(id, mods) => {
              setOpenMenuId(null);
              sel.handleNoteSelect(id, mods);
            }}
            onFolderSelect={(id, mods) => {
              setOpenMenuId(null);
              sel.handleFolderSelect(id, mods);
            }}
            onStartRename={(id) => {
              setRenamingFolderId(id);
              sel.setOpenFolderIds((prev) => new Set(prev).add(id));
            }}
            onCommitRename={(id, name) => {
              setRenamingFolderId(null);
              onRenameFolder(id, name);
            }}
            onCancelRename={() => setRenamingFolderId(null)}
            onCreateNote={(folderId) => {
              setOpenMenuId(null);
              sel.setOpenFolderIds((prev) => new Set(prev).add(folderId));
              onFocusFolder(folderId);
              onCreateNote(folderId);
            }}
            onCreateFolder={async (parentId) => {
              setOpenMenuId(null);
              sel.setOpenFolderIds((prev) => new Set(prev).add(parentId));
              onFocusFolder(parentId);
              const folder = await onCreateFolder(parentId);
              setRenamingFolderId(folder.id);
              sel.setOpenFolderIds((prev) => new Set(prev).add(folder.id));
              return folder;
            }}
            onDeleteFolder={onDeleteFolder}
            onPublish={onPublish}
            onUpdatePublishOptions={onUpdatePublishOptions}
            onUnpublish={onUnpublish}
            onDelete={onDelete}
            onError={onError}
            setOpenMenuId={setOpenMenuId}
          />
        </div>

        {createPortal(
          <DragOverlay dropAnimation={dropAnimation} zIndex={9999}>
            {activeFolder ? (
              <FolderDragOverlay folder={activeFolder} />
            ) : (
              <NoteDragOverlay note={activeNote} />
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      {deleteConfirm &&
        createPortal(
          <div
            className="nordly-vault-modal-backdrop fadein"
            onClick={() => {
              if (!deleteBusy) setDeleteConfirm(null);
            }}
          >
            <div
              ref={deleteDialogRef}
              className="nordly-vault-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="nordly-notes-delete-title"
              tabIndex={-1}
            >
              <h2 id="nordly-notes-delete-title" className="nordly-vault-modal__title">
                {t('nordly.notes.delete_confirm_title')}
              </h2>
              <p className="nordly-vault-modal__body">{deleteConfirmBody}</p>
              <div className="nordly-vault-modal__actions">
                <button
                  type="button"
                  className="nordly-vault-modal__secondary"
                  disabled={deleteBusy}
                  onClick={() => setDeleteConfirm(null)}
                >
                  {t('nordly.notes.delete_confirm_cancel')}
                </button>
                <button
                  type="button"
                  className="nordly-vault-modal__primary"
                  disabled={deleteBusy}
                  onClick={() => void runDeleteConfirm()}
                >
                  {t('nordly.notes.delete_confirm_action')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </aside>
  );
});
