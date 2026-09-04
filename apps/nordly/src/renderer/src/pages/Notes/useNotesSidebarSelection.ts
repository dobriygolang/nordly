import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { NoteFolder, NoteSummary } from '@features/notes/api/notesClient';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';
import {
  folderSelKey,
  isNotesListHotkeyBlocked,
  noteSelKey,
  parseSelKey,
  type SelectMods,
} from './selectionKeys';
import type { ListState } from './utils';

const FOLDERS_OPEN_KEY = STORAGE_KEYS.notesFoldersOpen;
const EMPTY_FOLDER_LIST: NoteFolder[] = [];

function readOpenFolderIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(FOLDERS_OPEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn('[nordly:notes] open folders storage is not an array');
      return new Set();
    }
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch (err) {
    console.warn('[nordly:notes] open folders load failed', err);
    return new Set();
  }
}

export function useNotesSidebarSelection({
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
}: {
  list: ListState;
  folders: NoteFolder[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFocusFolder: (folderId: string | null) => void;
  onDeleteFolder: (id: string) => Promise<void>;
  onDeleteMany: (ids: string[]) => Promise<void>;
  listFocusRef: React.RefObject<HTMLDivElement | null>;
  rootRef: React.RefObject<HTMLElement | null>;
  renamingFolderId: string | null;
  createMenuOpen: boolean;
  openMenuId: string | null;
  activeNote: NoteSummary | null;
  activeFolder: NoteFolder | null;
  deleteConfirm: { folderIds: string[]; noteIds: string[] } | null;
  deleteBusy: boolean;
  setDeleteConfirm: React.Dispatch<
    React.SetStateAction<{ folderIds: string[]; noteIds: string[] } | null>
  >;
}) {
  const [openFolderIds, setOpenFolderIds] = useState<Set<string>>(readOpenFolderIds);
  const [selectionIds, setSelectionIds] = useState<Set<string>>(() =>
    selectedId ? new Set([noteSelKey(selectedId)]) : new Set(),
  );
  const selectionIdsRef = useRef(selectionIds);
  selectionIdsRef.current = selectionIds;
  const anchorIdRef = useRef<string | null>(selectedId ? noteSelKey(selectedId) : null);

  const setSelection = useCallback((next: Set<string>) => {
    selectionIdsRef.current = next;
    setSelectionIds(next);
  }, []);

  const focusList = useCallback(() => {
    listFocusRef.current?.focus({ preventScroll: true });
  }, [listFocusRef]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FOLDERS_OPEN_KEY, JSON.stringify([...openFolderIds]));
    } catch (err) {
      console.warn('[nordly:notes] failed to persist open folders', err);
    }
  }, [openFolderIds]);

  useEffect(() => {
    if (!selectedId) return;
    const key = noteSelKey(selectedId);
    setSelectionIds((prev) => {
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

  const toggleFolder = useCallback((id: string) => {
    setOpenFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
    const seen = new Set<string>();
    for (const f of folders) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      const rawParent = f.parentId ?? null;
      const parent =
        rawParent && rawParent !== f.id && idSet.has(rawParent) ? rawParent : null;
      const listForParent = map.get(parent);
      if (listForParent) listForParent.push(f);
      else map.set(parent, [f]);
    }
    for (const [, kids] of map) {
      kids.sort((a, b) => a.name.localeCompare(b.name));
    }
    return map;
  }, [folders]);

  const rootFolders = useMemo(
    () => childrenByParent.get(null) ?? EMPTY_FOLDER_LIST,
    [childrenByParent],
  );
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

  const applyRangeSelection = useCallback(
    (toKey: string) => {
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
    },
    [visibleSelKeys, allSelKeys, setSelection],
  );

  const toggleSelectionKey = useCallback(
    (key: string) => {
      const prev = selectionIdsRef.current;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) next.add(key);
      setSelection(next);
      anchorIdRef.current = key;
    },
    [setSelection],
  );

  const handleNoteSelect = useCallback(
    (id: string, mods: SelectMods) => {
      focusList();
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
      onFocusFolder(null);
      onSelect(id);
    },
    [focusList, applyRangeSelection, toggleSelectionKey, onSelect, onFocusFolder, setSelection],
  );

  const handleFolderSelect = useCallback(
    (id: string, mods: SelectMods) => {
      focusList();
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
      onFocusFolder(id);
    },
    [focusList, applyRangeSelection, toggleSelectionKey, onFocusFolder, setSelection],
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
    setDeleteConfirm({ folderIds, noteIds });
  }, [selectedId, partitionSelection, setDeleteConfirm]);

  const executeDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    const { folderIds, noteIds } = deleteConfirm;
    const selectedFolders = new Set(folderIds);
    const roots = folderIds.filter((id) => {
      let parent = folders.find((f) => f.id === id)?.parentId ?? null;
      const seen = new Set<string>();
      while (parent) {
        if (seen.has(parent)) break;
        seen.add(parent);
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
  }, [deleteConfirm, folders, list.notes, onDeleteFolder, onDeleteMany, setDeleteConfirm, setSelection]);

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
      if (activeNote || activeFolder) return;

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
    activeFolder,
    allSelKeys,
    visibleSelKeys,
    selectedId,
    requestDeleteSelection,
    onSelect,
    focusList,
    setSelection,
    rootRef,
    setDeleteConfirm,
  ]);

  return {
    openFolderIds,
    setOpenFolderIds,
    selectionIds,
    setSelection,
    anchorIdRef,
    folderIds,
    unfiledNotes,
    notesByFolder,
    childrenByParent,
    rootFolders,
    hasFolders,
    toggleFolder,
    handleNoteSelect,
    handleFolderSelect,
    requestDeleteSelection,
    executeDeleteConfirm,
    focusList,
  };
}
