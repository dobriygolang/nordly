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
  type DragOverEvent,
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
import {
  folderSelKey,
  isNotesListHotkeyBlocked,
  noteSelKey,
  parseSelKey,
  type SelectMods,
} from './selectionKeys';

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
  previewActive,
}: {
  children: React.ReactNode;
  enabled: boolean;
  previewChildren: React.ReactNode;
  previewActive: boolean;
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
      data-drop-active={isOver || previewActive ? 'true' : 'false'}
    >
      {previewActive ? previewChildren : children}
    </div>
  );
}

/** Whole folder group (header + open notes) is one drop target. */
function FolderDropZone({
  folderId,
  disabled,
  previewChildren,
  previewActive,
  open,
  onHoverOpen,
  header,
  children,
}: {
  folderId: string;
  disabled: boolean;
  previewChildren: React.ReactNode;
  previewActive: boolean;
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
    if (previewActive && previewChildren) onHoverOpen(folderId);
  }, [previewActive, previewChildren, folderId, onHoverOpen]);

  return (
    <div
      ref={setNodeRef}
      className="nordly-folder-group nordly-folder-drop"
      data-drop-active={isOver || previewActive ? 'true' : 'false'}
    >
      {header}
      {open ? (previewActive ? previewChildren : children) : null}
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
  onDeleteMany: (ids: string[]) => Promise<void>;
  onError?: (message: string) => void;
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
  onDeleteMany,
  onError,
}: SidebarProps) {
  const t = useT();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPos, setCreateMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(readOpenFolderIds);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<NoteSummary | null>(null);
  const [previewFolderId, setPreviewFolderId] = useState<string | null | undefined>(undefined);
  const [selectionIds, setSelectionIds] = useState<Set<string>>(() =>
    selectedId ? new Set([noteSelKey(selectedId)]) : new Set(),
  );
  const selectionIdsRef = useRef(selectionIds);
  selectionIdsRef.current = selectionIds;
  const [deleteConfirm, setDeleteConfirm] = useState<{
    folderIds: string[];
    noteIds: string[];
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const anchorIdRef = useRef<string | null>(selectedId ? noteSelKey(selectedId) : null);
  const listFocusRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  const setSelection = useCallback((next: Set<string>) => {
    selectionIdsRef.current = next;
    setSelectionIds(next);
  }, []);

  const createBtnRef = useRef<HTMLButtonElement>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const createRowRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const closeCreateMenu = useCallback(() => setCreateMenuOpen(false), []);

  const focusList = useCallback(() => {
    listFocusRef.current?.focus({ preventScroll: true });
  }, []);

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
    } catch (err) {
      // Quota / private mode — open state is best-effort UI prefs only.
      console.warn('[nordly:notes] failed to persist open folders', err);
    }
  }, [openFolderIds]);

  // Keep multi-select in sync when the open note changes from outside (create / deep link).
  useEffect(() => {
    if (!selectedId) return;
    const key = noteSelKey(selectedId);
    setSelectionIds((prev) => {
      // Never clobber an active multi-select (⌘A includes folders).
      if (prev.size > 1) {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        selectionIdsRef.current = next;
        return next;
      }
      if (prev.size === 1 && prev.has(key)) return prev;
      const next = new Set([key]);
      selectionIdsRef.current = next;
      return next;
    });
    if (selectionIdsRef.current.size <= 1) {
      anchorIdRef.current = key;
    }
  }, [selectedId]);

  useEffect(() => {
    setSelectionIds((prev) => {
      const aliveNotes = new Set(list.notes.map((n) => noteSelKey(n.id)));
      const aliveFolders = new Set(folders.map((f) => folderSelKey(f.id)));
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        const parsed = parseSelKey(key);
        if (!parsed) {
          changed = true;
          continue;
        }
        if (parsed.type === 'note' && aliveNotes.has(key)) next.add(key);
        else if (parsed.type === 'folder' && aliveFolders.has(key)) next.add(key);
        else changed = true;
      }
      if (changed) selectionIdsRef.current = next;
      return changed ? next : prev;
    });
  }, [list.notes, folders]);

  useEffect(() => {
    if (!activeNote) {
      document.body.classList.remove('nordly-note-dragging');
      return;
    }
    document.body.classList.add('nordly-note-dragging');
    const clearDrag = () => {
      setActiveNote(null);
      setPreviewFolderId(undefined);
    };
    // Pointer cancel / window blur can skip dnd-kit dragEnd and leave a stacked preview.
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

  useEffect(() => {
    setOpenFolderIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (folderIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [folderIds]);

  const unfiledNotes = useMemo(
    () =>
      list.notes.filter((n) => {
        const fid = n.folderId;
        return !fid || !folderIds.has(fid);
      }),
    [list.notes, folderIds],
  );

  const notesByFolder = useMemo(() => {
    const map = new Map<string, NoteSummary[]>();
    for (const f of folders) map.set(f.id, []);
    for (const n of list.notes) {
      const fid = n.folderId;
      if (!fid || !folderIds.has(fid)) continue;
      map.get(fid)?.push(n);
    }
    return map;
  }, [list.notes, folders, folderIds]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, NoteFolder[]>();
    const idSet = new Set(folders.map((f) => f.id));
    for (const f of folders) {
      const rawParent = f.parentId ?? null;
      const parent = rawParent && idSet.has(rawParent) ? rawParent : null;
      const listForParent = map.get(parent);
      if (listForParent) listForParent.push(f);
      else map.set(parent, [f]);
    }
    for (const [, kids] of map) {
      kids.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [folders]);

  const rootFolders = childrenByParent.get(null) ?? [];
  const hasFolders = folders.length > 0;

  const visibleSelKeys = useMemo(() => {
    const keys: string[] = [];
    for (const n of unfiledNotes) keys.push(noteSelKey(n.id));
    const walk = (folderList: NoteFolder[]) => {
      for (const folder of folderList) {
        keys.push(folderSelKey(folder.id));
        const open = openFolderIds.has(folder.id) || renamingFolderId === folder.id;
        if (!open) continue;
        for (const n of notesByFolder.get(folder.id) ?? []) keys.push(noteSelKey(n.id));
        walk(childrenByParent.get(folder.id) ?? []);
      }
    };
    walk(rootFolders);
    return keys;
  }, [
    unfiledNotes,
    rootFolders,
    openFolderIds,
    renamingFolderId,
    notesByFolder,
    childrenByParent,
  ]);

  const allSelKeys = useMemo(() => {
    const keys = list.notes.map((n) => noteSelKey(n.id));
    for (const f of folders) keys.push(folderSelKey(f.id));
    return keys;
  }, [list.notes, folders]);

  const applyRangeSelection = useCallback((toKey: string) => {
    const anchor = anchorIdRef.current ?? toKey;
    const order = visibleSelKeys.length > 0 ? visibleSelKeys : allSelKeys;
    const a = order.indexOf(anchor);
    const b = order.indexOf(toKey);
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelection(new Set(order.slice(lo, hi + 1)));
    } else {
      setSelection(new Set([toKey]));
      anchorIdRef.current = toKey;
    }
  }, [visibleSelKeys, allSelKeys, setSelection]);

  const toggleSelectionKey = useCallback((key: string) => {
    const prev = selectionIdsRef.current;
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (next.size === 0) next.add(key);
    setSelection(next);
    anchorIdRef.current = key;
  }, [setSelection]);

  const handleNoteSelect = useCallback(
    (id: string, mods: SelectMods) => {
      focusList();
      setOpenMenuId(null);
      const key = noteSelKey(id);
      const toggle = mods.metaKey || mods.ctrlKey;
      if (mods.shiftKey && !toggle) {
        applyRangeSelection(key);
        onSelect(id);
        return;
      }
      if (toggle) {
        toggleSelectionKey(key);
        onSelect(id);
        return;
      }
      setSelection(new Set([key]));
      anchorIdRef.current = key;
      onSelect(id);
    },
    [focusList, applyRangeSelection, toggleSelectionKey, onSelect, setSelection],
  );

  const handleFolderSelect = useCallback(
    (id: string, mods: SelectMods) => {
      focusList();
      setOpenMenuId(null);
      const key = folderSelKey(id);
      const toggle = mods.metaKey || mods.ctrlKey;
      if (mods.shiftKey && !toggle) {
        applyRangeSelection(key);
        return;
      }
      if (toggle) {
        toggleSelectionKey(key);
        return;
      }
      setSelection(new Set([key]));
      anchorIdRef.current = key;
    },
    [focusList, applyRangeSelection, toggleSelectionKey, setSelection],
  );

  const partitionSelection = useCallback((keys: string[]) => {
    const folderIds: string[] = [];
    const noteIds: string[] = [];
    for (const key of keys) {
      const parsed = parseSelKey(key);
      if (!parsed) continue;
      if (parsed.type === 'folder') folderIds.push(parsed.id);
      else noteIds.push(parsed.id);
    }
    return { folderIds, noteIds };
  }, []);

  const requestDeleteSelection = useCallback(() => {
    const keys =
      selectionIdsRef.current.size > 0
        ? [...selectionIdsRef.current]
        : selectedId
          ? [noteSelKey(selectedId)]
          : [];
    if (keys.length === 0) return;
    const { folderIds, noteIds } = partitionSelection(keys);
    if (folderIds.length === 0 && noteIds.length === 0) return;
    // Tauri WebView often returns false from window.confirm — use in-app dialog.
    setDeleteConfirm({ folderIds, noteIds });
  }, [selectedId, partitionSelection]);

  const executeDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    const { folderIds, noteIds } = deleteConfirm;
    setDeleteBusy(true);
    try {
      const selectedFolders = new Set(folderIds);
      // Only delete topmost selected folders (children cascade with the parent).
      const roots = folderIds.filter((id) => {
        let parent = folders.find((f) => f.id === id)?.parentId ?? null;
        while (parent) {
          if (selectedFolders.has(parent)) return false;
          parent = folders.find((f) => f.id === parent)?.parentId ?? null;
        }
        return true;
      });

      const cascadeFolders = new Set<string>();
      for (const rootId of roots) {
        cascadeFolders.add(rootId);
        let grew = true;
        while (grew) {
          grew = false;
          for (const f of folders) {
            if (f.parentId && cascadeFolders.has(f.parentId) && !cascadeFolders.has(f.id)) {
              cascadeFolders.add(f.id);
              grew = true;
            }
          }
        }
      }
      const leftoverNotes = noteIds.filter((id) => {
        const note = list.notes.find((n) => n.id === id);
        // Skip missing / already-cascaded rows — folder delete removes them first.
        if (!note) return false;
        if (note.folderId && cascadeFolders.has(note.folderId)) return false;
        return true;
      });

      for (const folderId of roots) {
        try {
          await onDeleteFolder(folderId);
        } catch {
          /* error surfaced by NotesPage */
        }
      }
      if (leftoverNotes.length > 0) {
        await onDeleteMany(leftoverNotes);
      }
      setSelection(new Set());
      setDeleteConfirm(null);
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteConfirm, folders, list.notes, onDeleteFolder, onDeleteMany, setSelection]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.closest('.nordly-page-layer[data-status="leaving"]')) return;
      if (deleteConfirm) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (!deleteBusy) setDeleteConfirm(null);
        }
        return;
      }
      if (isNotesListHotkeyBlocked(e)) return;
      if (renamingFolderId || createMenuOpen || openMenuId) return;
      if (activeNote) return;

      const mod = e.metaKey || e.ctrlKey;
      const isBackspace =
        e.key === 'Backspace' ||
        e.key === 'Delete' ||
        e.code === 'Backspace' ||
        e.code === 'Delete';

      if (mod && !e.shiftKey && (e.key.toLowerCase() === 'a' || e.code === 'KeyA')) {
        e.preventDefault();
        e.stopPropagation();
        if (allSelKeys.length === 0) return;
        setSelection(new Set(allSelKeys));
        anchorIdRef.current =
          (selectedId ? noteSelKey(selectedId) : null) ?? allSelKeys[0] ?? null;
        focusList();
        return;
      }

      if (!mod && !e.altKey && isBackspace) {
        e.preventDefault();
        e.stopPropagation();
        requestDeleteSelection();
        return;
      }

      if (!mod && !e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const order = visibleSelKeys.length > 0 ? visibleSelKeys : allSelKeys;
        if (order.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const current =
          (selectionIdsRef.current.size === 1 ? [...selectionIdsRef.current][0] : null) ??
          (selectedId ? noteSelKey(selectedId) : null) ??
          anchorIdRef.current;
        const idx = current ? order.indexOf(current) : -1;
        const nextIdx =
          e.key === 'ArrowDown'
            ? Math.min(order.length - 1, Math.max(0, idx) + (idx < 0 ? 0 : 1))
            : Math.max(0, (idx < 0 ? 0 : idx) - 1);
        const nextKey = order[nextIdx];
        if (!nextKey) return;
        if (e.shiftKey && current && idx >= 0) {
          const anchor = anchorIdRef.current ?? current;
          const a = order.indexOf(anchor);
          const [lo, hi] = a < nextIdx ? [a, nextIdx] : [nextIdx, a];
          setSelection(new Set(order.slice(lo, hi + 1)));
        } else {
          setSelection(new Set([nextKey]));
          anchorIdRef.current = nextKey;
        }
        const parsed = parseSelKey(nextKey);
        if (parsed?.type === 'note') onSelect(parsed.id);
        focusList();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [
    deleteConfirm,
    deleteBusy,
    renamingFolderId,
    createMenuOpen,
    openMenuId,
    activeNote,
    allSelKeys,
    visibleSelKeys,
    selectedId,
    requestDeleteSelection,
    onSelect,
    focusList,
    setSelection,
  ]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setOpenMenuId(null);
      const note = list.notes.find((n) => n.id === event.active.id);
      setActiveNote(note ?? null);
      const folderId = note?.folderId && folderIds.has(note.folderId) ? note.folderId : null;
      setPreviewFolderId(note ? folderId : undefined);
    },
    [folderIds, list.notes],
  );

  const handleDragCancel = useCallback(() => {
    setActiveNote(null);
    setPreviewFolderId(undefined);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over ? String(event.over.id) : null;
    const folderId = resolveDropFolderId(overId);
    // Keep the last valid target while crossing small gaps between drop zones.
    if (folderId !== undefined) setPreviewFolderId(folderId);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveNote(null);
      setPreviewFolderId(undefined);
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

  const renderNote = (n: NoteSummary, nested: boolean, depth: number) => (
    <DraggableNoteRow
      key={n.id}
      note={n}
      nested={nested}
      depth={depth}
      active={selectedId === n.id}
      selected={selectionIds.has(noteSelKey(n.id))}
      menuOpen={openMenuId === n.id}
      dragDisabled={!hasFolders}
      forceDragging={activeNote?.id === n.id}
      onMenuOpenChange={(open) => setOpenMenuId(open ? n.id : null)}
      onSelect={handleNoteSelect}
      onPublish={onPublish}
      onUpdatePublishOptions={onUpdatePublishOptions}
      onUnpublish={onUnpublish}
      onDelete={onDelete}
      onError={onError}
    />
  );

  const renderDropPreview = (
    notes: NoteSummary[],
    nested: boolean,
    targetFolderId: string | null,
    depth: number,
  ): React.ReactNode => {
    if (!activeNote) return notes.map((note) => renderNote(note, nested, depth));

    const rows = notes.map((note) => renderNote(note, nested, depth));
    if (activeNoteFolderId !== targetFolderId) {
      return [
        <NoteInsertPreview
          key={`preview:${targetFolderId ?? 'unfiled'}`}
          note={activeNote}
          nested={nested}
          depth={depth}
        />,
        ...rows,
      ];
    }

    // Same-folder drag: keep draggable mounted (forceDragging hides it) and show
    // insert preview in its place — never stack both in one grid cell.
    return notes.map((note) =>
      note.id === activeNote.id ? (
        <div className="nordly-note-drag-origin" key={`preview:${note.id}`}>
          {renderNote(note, nested, depth)}
          <NoteInsertPreview note={activeNote} nested={nested} depth={depth} />
        </div>
      ) : (
        renderNote(note, nested, depth)
      ),
    );
  };

  const renderIdleRows = (
    notes: NoteSummary[],
    nested: boolean,
    containerFolderId: string | null,
    depth: number,
  ): React.ReactNode =>
    notes
      .filter(
        (note) =>
          !activeNote ||
          note.id !== activeNote.id ||
          activeNoteFolderId !== containerFolderId ||
          previewFolderId === containerFolderId,
      )
      .map((note) => renderNote(note, nested, depth));

  const renderFolderTree = (folderList: NoteFolder[], depth: number): React.ReactNode =>
    folderList.map((folder) => {
      const open = openFolderIds.has(folder.id) || renamingFolderId === folder.id;
      const childNotes = notesByFolder.get(folder.id) ?? [];
      const childFolders = childrenByParent.get(folder.id) ?? [];
      return (
        <FolderDropZone
          key={folder.id}
          folderId={folder.id}
          disabled={renamingFolderId === folder.id}
          previewChildren={renderDropPreview(childNotes, true, folder.id, depth)}
          previewActive={activeNote != null && previewFolderId === folder.id}
          open={open}
          onHoverOpen={openFolderOnHover}
          header={
            <FolderRow
              folder={folder}
              open={open}
              selected={selectionIds.has(folderSelKey(folder.id))}
              depth={depth}
              menuOpen={openMenuId === `folder:${folder.id}`}
              renaming={renamingFolderId === folder.id}
              onMenuOpenChange={(menuOpen) =>
                setOpenMenuId(menuOpen ? `folder:${folder.id}` : null)
              }
              onToggle={toggleFolder}
              onSelect={handleFolderSelect}
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
          {open ? (
            <>
              {renderIdleRows(childNotes, true, folder.id, depth)}
              {renderFolderTree(childFolders, depth + 1)}
            </>
          ) : null}
        </FolderDropZone>
      );
    });

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
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          ref={listFocusRef}
          className="nordly-vault-sidebar__list"
          tabIndex={-1}
          onMouseDown={(e) => {
            // Click empty list chrome — take focus so ⌫ / arrows work (not the editor).
            if (e.target === e.currentTarget) focusList();
          }}
        >
          <UnfiledDropZone
            enabled={hasFolders}
            previewChildren={renderDropPreview(unfiledNotes, false, null, 0)}
            previewActive={activeNote != null && previewFolderId === null}
          >
            {hasFolders ? (
              <div className="nordly-notes-section-label">{t('nordly.notes.unfiled')}</div>
            ) : null}
            {renderIdleRows(unfiledNotes, false, null, 0)}
          </UnfiledDropZone>

          {renderFolderTree(rootFolders, 0)}
        </div>

        {createPortal(
          <DragOverlay dropAnimation={dropAnimation} zIndex={9999}>
            <NoteDragOverlay note={activeNote} />
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
              className="nordly-vault-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="nordly-notes-delete-title"
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
                  onClick={() => void executeDeleteConfirm()}
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
