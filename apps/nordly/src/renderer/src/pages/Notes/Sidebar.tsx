import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  defaultDropAnimationSideEffects,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { useT } from '@nordly-i18n';

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
import { DraggableNoteRow } from './DraggableNoteRow';
import { FolderRow } from './FolderRow';
import { NoteDragOverlay } from './NoteDragOverlay';
import { NoteInsertPreview } from './NoteInsertPreview';
import {
  UNFILED_DROPPABLE_ID,
  folderDroppableId,
  notesCollisionDetection,
  resolveDropFolderId,
  type NoteDropData,
} from './noteDnd';
import { type ListState } from './utils';

const CREATE_MENU_W = 168;
const FOLDERS_OPEN_KEY = 'nordly:notes:folders-open';

const dropAnimation = {
  duration: 200,
  easing: 'ease-out',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.5' } },
  }),
};

function readOpenFolderIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(FOLDERS_OPEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function UnfiledDropZone({
  children,
  enabled,
  previewChildren,
}: {
  children: React.ReactNode;
  enabled: boolean;
  previewChildren: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: UNFILED_DROPPABLE_ID,
    disabled: !enabled,
    data: { type: 'unfiled' } satisfies NoteDropData,
  });

  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={setNodeRef}
      className="nordly-notes-unfiled-drop"
      data-drop-active={isOver ? 'true' : 'false'}
    >
      {isOver ? previewChildren : children}
    </div>
  );
}

/** Whole folder group (header + open notes) is one drop target. */
function FolderDropZone({
  folderId,
  disabled,
  previewChildren,
  open,
  onHoverOpen,
  header,
  children,
}: {
  folderId: string;
  disabled: boolean;
  previewChildren: React.ReactNode;
  open: boolean;
  onHoverOpen: (folderId: string) => void;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: folderDroppableId(folderId),
    disabled,
    data: { type: 'folder', folderId } satisfies NoteDropData,
  });

  useEffect(() => {
    if (isOver && previewChildren) onHoverOpen(folderId);
  }, [isOver, previewChildren, folderId, onHoverOpen]);

  return (
    <div
      ref={setNodeRef}
      className="nordly-folder-group nordly-folder-drop"
      data-drop-active={isOver ? 'true' : 'false'}
    >
      {header}
      {open ? (isOver ? previewChildren : children) : null}
    </div>
  );
}

export interface SidebarProps {
  list: ListState;
  folders: NoteFolder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNote: () => void;
  onCreateFolder: () => Promise<NoteFolder>;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => Promise<void>;
  onMoveNote: (noteId: string, folderId: string | null) => Promise<void>;
  onFocusFolder: (folderId: string | null) => void;
  onPublish: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUpdatePublishOptions: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUnpublish: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const Sidebar = memo(function Sidebar({
  list,
  folders,
  selectedId,
  onSelect,
  onCreateNote,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveNote,
  onFocusFolder,
  onPublish,
  onUpdatePublishOptions,
  onUnpublish,
  onDelete,
}: SidebarProps) {
  const t = useT();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPos, setCreateMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(readOpenFolderIds);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<NoteSummary | null>(null);

  const createBtnRef = useRef<HTMLButtonElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const createRowRef = useRef<HTMLDivElement>(null);

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
    try {
      window.localStorage.setItem(FOLDERS_OPEN_KEY, JSON.stringify([...openFolderIds]));
    } catch {
      /* ignore */
    }
  }, [openFolderIds]);

  useEffect(() => {
    if (!activeNote) {
      document.body.classList.remove('nordly-note-dragging');
      return;
    }
    document.body.classList.add('nordly-note-dragging');
    return () => document.body.classList.remove('nordly-note-dragging');
  }, [activeNote]);

  const toggleFolder = useCallback(
    (id: string) => {
      setOpenFolderIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      onFocusFolder(id);
    },
    [onFocusFolder],
  );

  const folderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);

  const unfiledNotes = useMemo(
    () =>
      list.notes.filter((n) => {
        const fid = n.folderId;
        return !fid || !folderIds.has(fid);
      }),
    [list.notes, folderIds],
  );

  const notesByFolder = useMemo(() => {
    const map = new Map<string, typeof list.notes>();
    for (const f of folders) map.set(f.id, []);
    for (const n of list.notes) {
      const fid = n.folderId;
      if (!fid || !folderIds.has(fid)) continue;
      map.get(fid)?.push(n);
    }
    return map;
  }, [list.notes, folders, folderIds]);

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name)),
    [folders],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setOpenMenuId(null);
      const note = list.notes.find((n) => n.id === event.active.id);
      setActiveNote(note ?? null);
    },
    [list.notes],
  );

  const handleDragCancel = useCallback(() => {
    setActiveNote(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveNote(null);
      const noteId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      const folderId = resolveDropFolderId(overId);
      if (folderId === undefined) return;

      const note = list.notes.find((n) => n.id === noteId);
      const current = note?.folderId && folderIds.has(note.folderId) ? note.folderId : null;
      const next = folderId;
      if (current === next) return;

      if (next) {
        setOpenFolderIds((prev) => new Set(prev).add(next));
        onFocusFolder(next);
      } else {
        onFocusFolder(null);
      }
      void onMoveNote(noteId, next).catch(() => {
        /* error surfaced by NotesPage */
      });
    },
    [folderIds, list.notes, onFocusFolder, onMoveNote],
  );

  const openFolderOnHover = useCallback((folderId: string) => {
    setOpenFolderIds((prev) => {
      if (prev.has(folderId)) return prev;
      return new Set(prev).add(folderId);
    });
  }, []);

  const activeNoteFolderId =
    activeNote?.folderId && folderIds.has(activeNote.folderId) ? activeNote.folderId : null;

  const renderNote = (n: NoteSummary, nested: boolean) => (
    <DraggableNoteRow
      key={n.id}
      note={n}
      nested={nested}
      active={selectedId === n.id}
      menuOpen={openMenuId === n.id}
      dragDisabled={sortedFolders.length === 0}
      onMenuOpenChange={(open) => setOpenMenuId(open ? n.id : null)}
      onSelect={onSelect}
      onPublish={onPublish}
      onUpdatePublishOptions={onUpdatePublishOptions}
      onUnpublish={onUnpublish}
      onDelete={onDelete}
    />
  );

  const renderDropPreview = (
    notes: NoteSummary[],
    nested: boolean,
    targetFolderId: string | null,
  ): React.ReactNode => {
    if (!activeNote) return notes.map((note) => renderNote(note, nested));

    const rows = notes.map((note) => renderNote(note, nested));
    if (activeNoteFolderId !== targetFolderId) {
      return [
        <NoteInsertPreview key={`preview:${targetFolderId ?? 'unfiled'}`} note={activeNote} nested={nested} />,
        ...rows,
      ];
    }

    return notes.flatMap((note) =>
      note.id === activeNote.id
        ? [
            <NoteInsertPreview key={`preview:${note.id}`} note={activeNote} nested={nested} />,
            renderNote(note, nested),
          ]
        : [renderNote(note, nested)],
    );
  };

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
                    setOpenFolderIds((prev) => new Set(prev).add(folder.id));
                    onFocusFolder(folder.id);
                  })
                  .catch(() => {
                    /* error surfaced by NotesPage */
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
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="nordly-vault-sidebar__list">
          <UnfiledDropZone
            enabled={sortedFolders.length > 0}
            previewChildren={renderDropPreview(unfiledNotes, false, null)}
          >
            {sortedFolders.length > 0 ? (
              <div className="nordly-notes-section-label">{t('nordly.notes.unfiled')}</div>
            ) : null}
            {unfiledNotes.map((n) => renderNote(n, false))}
          </UnfiledDropZone>

          {sortedFolders.map((folder) => {
            const open = openFolderIds.has(folder.id) || renamingFolderId === folder.id;
            const childNotes = notesByFolder.get(folder.id) ?? [];
            return (
              <FolderDropZone
                key={folder.id}
                folderId={folder.id}
                disabled={renamingFolderId === folder.id}
                previewChildren={renderDropPreview(childNotes, true, folder.id)}
                open={open}
                onHoverOpen={openFolderOnHover}
                header={
                  <FolderRow
                    folder={folder}
                    open={open}
                    menuOpen={openMenuId === `folder:${folder.id}`}
                    renaming={renamingFolderId === folder.id}
                    onMenuOpenChange={(menuOpen) =>
                      setOpenMenuId(menuOpen ? `folder:${folder.id}` : null)
                    }
                    onToggle={toggleFolder}
                    onStartRename={(id) => {
                      setRenamingFolderId(id);
                      setOpenFolderIds((prev) => new Set(prev).add(id));
                      onFocusFolder(id);
                    }}
                    onCommitRename={(id, name) => {
                      setRenamingFolderId(null);
                      onRenameFolder(id, name);
                    }}
                    onCancelRename={() => setRenamingFolderId(null)}
                    onDelete={onDeleteFolder}
                  />
                }
              >
                {open ? childNotes.map((n) => renderNote(n, true)) : null}
              </FolderDropZone>
            );
          })}
        </div>

        {createPortal(
          <DragOverlay dropAnimation={dropAnimation} zIndex={9999}>
            <NoteDragOverlay note={activeNote} />
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </aside>
  );
});
