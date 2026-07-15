// Notes — Obsidian-minimal vault: file list + markdown editor (local-only).
// Sidebar instant-create (⌘N), debounced autosave to IndexedDB.
//
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useT } from '@nordly-i18n';

import {
  listNotes,
  listFolders,
  getNote,
  createNote,
  createFolder,
  renameFolder,
  deleteFolder,
  moveNoteToFolder,
  updateNote,
  publishNoteToWeb,
  unpublishNoteFromWeb,
  updatePublishedNoteOptions,
  deleteNote,
  openWikiLink,
  type Note,
  type NoteFolder,
  type PublishStatus,
  type PublishToWebOptions,
  isNoteVaultLocked,
} from '@features/notes/api/notesClient';
import { getServerId } from '@shared/sync/idMap';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { subscribeVault } from '@shared/crypto/vault';
import { isVaultReadyForPublish } from '@shared/crypto/vaultPublish';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import {
  INITIAL_LIST,
  SIDEBAR_COLLAPSED_KEY,
  errorMessage,
  type ListState,
} from './Notes/utils';
import { Sidebar } from './Notes/Sidebar';
import { NotesSidebarDivider, NotesSidebarEdge } from '@shared/ui/SidebarDivider';
import { Editor } from './Notes/Editor';
import { FileDropOverlay } from './Notes/FileDropOverlay';
import { VAULT_SIDEBAR_W } from './vaultSidebar';
import { isTauriRuntime } from '@platform/runtime';
import type { EntityNavigationRequest } from '@shared/model/navigation';
import {
  isFileDrag,
  listDroppedMarkdownFiles,
  listDroppedMarkdownPaths,
  readMarkdownFile,
  readMarkdownPath,
  type MarkdownDraft,
} from '@features/notes/lib/importMarkdownFiles';
import {
  NOTES_ZOOM_DEFAULT,
  loadNotesEditorZoom,
  saveNotesEditorZoom,
  stepNotesEditorZoom,
} from '@features/notes/lib/notesEditorZoom';

const SAVE_STATUS_FADE_MS = 1200;
const AUTOSAVE_DEBOUNCE_MS = 250;
const SIDEBAR_RESIZE_SETTLE_MS = 80;

export interface NotesPageProps {
  openRequest?: EntityNavigationRequest | null;
  onConsumeOpenRequest?: (requestKey: number) => void;
  onRegisterFlush?: (flush: (() => Promise<boolean>) | null) => void;
}

export function NotesPage({
  openRequest,
  onConsumeOpenRequest,
  onRegisterFlush,
}: NotesPageProps = {}) {
  const t = useT();
  const [list, setList] = useState<ListState>(INITIAL_LIST);
  const listRef = useRef<ListState>(INITIAL_LIST);
  listRef.current = list;
  const [folders, setFolders] = useState<NoteFolder[]>([]);
  const focusFolderIdRef = useRef<string | null>(null);
  const activeRef = useRef<Note | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(openRequest?.id ?? null);
  const [active, setActive] = useState<Note | null>(null);
  activeRef.current = active;
  selectedIdRef.current = selectedId;
  const [activeError, setActiveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [fileDropActive, setFileDropActive] = useState(false);
  const fileDragDepthRef = useRef(0);
  const [editorZoom, setEditorZoom] = useState(loadNotesEditorZoom);
  const saveTimer = useRef<number | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });
  const sidebarMountedRef = useRef(false);
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (!sidebarMountedRef.current) {
      sidebarMountedRef.current = true;
      return;
    }
    const t1 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    const t2 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), SIDEBAR_RESIZE_SETTLE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onToggle = () => setSidebarCollapsed((c) => !c);
    window.addEventListener(NORDLY_EVENTS.toggleSidebar, onToggle as EventListener);
    return () => window.removeEventListener(NORDLY_EVENTS.toggleSidebar, onToggle as EventListener);
  }, []);

  const loadListGen = useRef(0);
  const loadList = useCallback(() => {
    const gen = ++loadListGen.current;
    void listFolders()
      .then((folderRows) => {
        if (gen !== loadListGen.current) return;
        setFolders(folderRows);
      })
      .catch((err: unknown) => {
        if (gen !== loadListGen.current) return;
        setList((prev) => ({
          ...prev,
          status: prev.notes.length > 0 ? prev.status : 'error',
          error: errorMessage(err, t),
        }));
      });
    void listNotes()
      .then((res) => {
        if (gen !== loadListGen.current) return;
        setList({ status: 'ok', notes: res.notes, error: null });
        const firstId = res.notes[0]?.id ?? null;
        if (firstId) setSelectedId((cur) => cur ?? firstId);
      })
      .catch((err: unknown) => {
        if (gen !== loadListGen.current) return;
        setList((prev) => ({
          status: 'error',
          notes: prev.notes,
          error: errorMessage(err, t),
        }));
      });
  }, [t]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    const onNotesChanged = () => loadList();
    window.addEventListener(NORDLY_EVENTS.notesChanged, onNotesChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.notesChanged, onNotesChanged);
  }, [loadList]);

  useEffect(() => {
    const unsub = subscribeVault(() => {
      loadList();
      const id = selectedIdRef.current;
      if (!id) return;
      void getNote(id)
        .then((n) => {
          if (selectedIdRef.current !== id) return;
          setActive(n);
          if (!isNoteVaultLocked(n)) {
            setDraftTitle(n.title);
            setDraftBody(n.bodyMd);
          }
          setActiveError(null);
        })
        .catch((err: unknown) => {
          if (selectedIdRef.current !== id) return;
          setActive(null);
          setActiveError(errorMessage(err, t));
        });
    });
    return unsub;
  }, [loadList, t]);

  useEffect(() => {
    const onSync = () => {
      void (async () => {
        const prevSelected = selectedIdRef.current;
        if (prevSelected) {
          const mapped = await getServerId('notes', prevSelected);
          if (mapped && mapped !== prevSelected) setSelectedId(mapped);
        }
        loadList();
      })();
    };
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setActive(null);
      return;
    }
    if (activeRef.current?.id === selectedId) return;

    let cancelled = false;
    setActiveError(null);

    void getNote(selectedId)
      .then((n) => {
        if (cancelled) return;
        if (selectedIdRef.current !== selectedId) return;
        const ds = draftRef.current;
        const localDirty =
          ds.activeId === selectedId &&
          (ds.title !== n.title || ds.body !== n.bodyMd) &&
          (lastSavedRef.current.title !== ds.title || lastSavedRef.current.body !== ds.body);
        setActive(n);
        if (!localDirty && !isNoteVaultLocked(n)) {
          setDraftTitle(n.title);
          setDraftBody(n.bodyMd);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (!activeRef.current) {
          setActiveError(errorMessage(err, t));
          setActive(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, t]);

  const draftRef = useRef({ title: '', body: '', activeId: '' });
  draftRef.current = {
    title: draftTitle,
    body: draftBody,
    activeId: active?.id ?? '',
  };
  const lastSavedRef = useRef({ title: '', body: '' });
  useEffect(() => {
    if (active) lastSavedRef.current = { title: active.title, body: active.bodyMd };
  }, [active]);

  const flushNow = useCallback(async (): Promise<boolean> => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    while (saveInFlightRef.current) {
      if (!(await saveInFlightRef.current)) return false;
    }

    const { activeId, title, body } = draftRef.current;
    if (!activeId) return true;
    if (activeRef.current && isNoteVaultLocked(activeRef.current)) return true;
    if (lastSavedRef.current.title === title && lastSavedRef.current.body === body) return true;

    setSaveStatus('saving');
    const save = (async (): Promise<boolean> => {
      try {
        const n = await updateNote(activeId, title, body);
        lastSavedRef.current = { title: n.title, body: n.bodyMd };
        setActive((cur) => (cur && cur.id === n.id ? n : cur));
        setList((prev) => ({
          ...prev,
          notes: prev.notes.map((row) =>
            row.id === activeId
              ? { ...row, title: n.title, updatedAt: n.updatedAt, sizeBytes: n.sizeBytes }
              : row,
          ),
        }));
        setSaveStatus('saved');
        window.setTimeout(() => {
          setSaveStatus((cur) => (cur === 'saved' ? 'idle' : cur));
        }, SAVE_STATUS_FADE_MS);
        return true;
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
        setSaveStatus('idle');
        return false;
      }
    })();
    saveInFlightRef.current = save;
    try {
      return await save;
    } finally {
      if (saveInFlightRef.current === save) saveInFlightRef.current = null;
    }
  }, [t]);

  useEffect(() => {
    if (!active || isNoteVaultLocked(active)) return;
    if (draftTitle === active.title && draftBody === active.bodyMd) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushNow(), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [draftTitle, draftBody, active, flushNow]);

  useEffect(() => {
    const onBlur = () => void flushNow();
    const onBeforeUnload = () => void flushNow();
    window.addEventListener('blur', onBlur);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onBeforeUnload);
      void flushNow();
    };
  }, [flushNow]);

  useEffect(() => {
    onRegisterFlush?.(flushNow);
    return () => onRegisterFlush?.(null);
  }, [flushNow, onRegisterFlush]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (await flushNow()) {
          await getCurrentWindow().destroy();
        }
      })
      .then((off) => {
        if (disposed) off();
        else unlisten = off;
      })
      .catch((err: unknown) => {
        if (!disposed) setActiveError(errorMessage(err, t));
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [flushNow, t]);

  useEffect(() => {
    if (!openRequest) return;
    let cancelled = false;
    void (async () => {
      if (!(await flushNow()) || cancelled) return;
      setSelectedId(openRequest.id);
      onConsumeOpenRequest?.(openRequest.requestKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [openRequest, flushNow, onConsumeOpenRequest]);

  const prependAndSelectNote = useCallback((n: Note) => {
    setList((prev) => ({
      ...prev,
      notes: [
        {
          id: n.id,
          title: n.title,
          updatedAt: n.updatedAt,
          sizeBytes: n.sizeBytes,
          folderId: n.folderId ?? null,
        },
        ...prev.notes,
      ],
    }));
    setSelectedId(n.id);
    setActive(n);
    setDraftTitle(n.title);
    setDraftBody(n.bodyMd);
    setActiveError(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!(await flushNow())) return;
    try {
      const folderId = focusFolderIdRef.current;
      const n = await createNote('Untitled', '', folderId);
      prependAndSelectNote(n);
    } catch (err: unknown) {
      setActiveError(errorMessage(err, t));
    }
  }, [flushNow, prependAndSelectNote, t]);

  const clearFileDrop = useCallback(() => {
    fileDragDepthRef.current = 0;
    setFileDropActive(false);
  }, []);

  const importMarkdownDrafts = useCallback(
    async (drafts: MarkdownDraft[]) => {
      if (drafts.length === 0) {
        setActiveError(t('nordly.notes.file_drop.only_md'));
        return;
      }
      if (!(await flushNow())) return;

      const folderId = focusFolderIdRef.current;
      let last: Note | null = null;
      try {
        for (const draft of drafts) {
          const n = await createNote(draft.title, draft.bodyMd, folderId);
          setList((prev) => ({
            ...prev,
            notes: [
              {
                id: n.id,
                title: n.title,
                updatedAt: n.updatedAt,
                sizeBytes: n.sizeBytes,
                folderId: n.folderId ?? null,
              },
              ...prev.notes,
            ],
          }));
          last = n;
        }
        if (last) {
          setSelectedId(last.id);
          setActive(last);
          setDraftTitle(last.title);
          setDraftBody(last.bodyMd);
          setActiveError(null);
        }
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [flushNow, t],
  );

  const onFileDragEnter = useCallback((e: ReactDragEvent) => {
    if (isTauriRuntime() || !isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    fileDragDepthRef.current += 1;
    setFileDropActive(true);
  }, []);

  const onFileDragOver = useCallback((e: ReactDragEvent) => {
    if (isTauriRuntime() || !isFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onFileDragLeave = useCallback(
    (e: ReactDragEvent) => {
      if (isTauriRuntime() || !isFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      fileDragDepthRef.current -= 1;
      if (fileDragDepthRef.current <= 0) {
        clearFileDrop();
      }
    },
    [clearFileDrop],
  );

  const handleFileDrop = useCallback(
    async (e: ReactDragEvent) => {
      if (isTauriRuntime() || !isFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      clearFileDrop();

      const markdownFiles = listDroppedMarkdownFiles(e.dataTransfer.files);
      if (markdownFiles.length === 0) {
        setActiveError(t('nordly.notes.file_drop.only_md'));
        return;
      }

      try {
        const drafts: MarkdownDraft[] = [];
        for (const file of markdownFiles) {
          drafts.push(await readMarkdownFile(file));
        }
        await importMarkdownDrafts(drafts);
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [clearFileDrop, importMarkdownDrafts, t],
  );

  // Tauri WebView does not deliver OS file drops via HTML5 File API — use native paths.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void getCurrentWindow()
      .onDragDropEvent((event) => {
        const { payload } = event;
        if (payload.type === 'enter' || payload.type === 'over') {
          setFileDropActive(true);
          return;
        }
        if (payload.type === 'leave') {
          clearFileDrop();
          return;
        }
        if (payload.type !== 'drop') return;
        clearFileDrop();

        const paths = listDroppedMarkdownPaths(payload.paths);
        if (paths.length === 0) {
          setActiveError(t('nordly.notes.file_drop.only_md'));
          return;
        }

        void (async () => {
          try {
            const drafts: MarkdownDraft[] = [];
            for (const path of paths) {
              drafts.push(
                await readMarkdownPath(path, (p) => invoke<string>('read_text_file', { path: p })),
              );
            }
            if (!disposed) await importMarkdownDrafts(drafts);
          } catch (err: unknown) {
            if (!disposed) setActiveError(errorMessage(err, t));
          }
        })();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err: unknown) => {
        if (!disposed) setActiveError(errorMessage(err, t));
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [clearFileDrop, importMarkdownDrafts, t]);

  const handleCreateFolder = useCallback(async (): Promise<NoteFolder> => {
    try {
      const folder = await createFolder(t('nordly.notes.folder.default_name'));
      setFolders((prev) => [...prev, folder]);
      focusFolderIdRef.current = folder.id;
      return folder;
    } catch (err: unknown) {
      setActiveError(errorMessage(err, t));
      throw err;
    }
  }, [t]);

  const handleRenameFolder = useCallback(
    (id: string, name: string) => {
      void renameFolder(id, name)
        .then((folder) => {
          setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
        })
        .catch((err: unknown) => {
          setActiveError(errorMessage(err, t));
        });
    },
    [t],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        await deleteFolder(id);
        setFolders((prev) => prev.filter((f) => f.id !== id));
        setList((prev) => ({
          ...prev,
          notes: prev.notes.map((n) =>
            n.folderId === id ? { ...n, folderId: null } : n,
          ),
        }));
        if (focusFolderIdRef.current === id) focusFolderIdRef.current = null;
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
        throw err;
      }
    },
    [t],
  );

  const handleMoveNote = useCallback(
    async (noteId: string, folderId: string | null) => {
      const previous =
        list.notes.find((n) => n.id === noteId)?.folderId ?? null;
      setList((prev) => ({
        ...prev,
        notes: prev.notes.map((n) => (n.id === noteId ? { ...n, folderId } : n)),
      }));
      if (folderId) focusFolderIdRef.current = folderId;
      try {
        await moveNoteToFolder(noteId, folderId);
      } catch (err: unknown) {
        setList((prev) => ({
          ...prev,
          notes: prev.notes.map((n) =>
            n.id === noteId ? { ...n, folderId: previous } : n,
          ),
        }));
        setActiveError(errorMessage(err, t));
        throw err;
      }
    },
    [list.notes, t],
  );

  const handleFocusFolder = useCallback((folderId: string | null) => {
    focusFolderIdRef.current = folderId;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;

      if (!e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void handleCreate();
        return;
      }

      // Obsidian-like notes editor zoom — only while Notes is open.
      const zoomIn =
        e.key === '=' || e.key === '+' || e.code === 'NumpadAdd';
      const zoomOut = e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract';
      const zoomReset = e.key === '0' || e.code === 'Numpad0';
      if (!zoomIn && !zoomOut && !zoomReset) return;

      e.preventDefault();
      setEditorZoom((prev) => {
        const next = zoomReset
          ? NOTES_ZOOM_DEFAULT
          : stepNotesEditorZoom(prev, zoomIn ? 1 : -1);
        saveNotesEditorZoom(next);
        return next;
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleCreate]);

  const onSelectNote = useCallback(
    (id: string) => {
      void (async () => {
        if (await flushNow()) setSelectedId(id);
      })();
    },
    [flushNow],
  );

  const handlePublish = useCallback(
    async (id: string, options: PublishToWebOptions): Promise<PublishStatus | void> => {
      if (!isCloudApiAvailable()) {
        setActiveError(t('nordly.notes.menu.publish_requires_cloud'));
        return;
      }
      if (!isVaultReadyForPublish()) {
        setActiveError(t('nordly.settings.vault.locked_publish'));
        return;
      }
      if (isVaultEnabledSync()) {
        const ok = window.confirm(t('nordly.notes.menu.publish_e2ee_warning'));
        if (!ok) return;
      }
      try {
        if (selectedIdRef.current === id && !(await flushNow())) return;
        return await publishNoteToWeb(id, options);
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [flushNow, t],
  );

  const handleUpdatePublishOptions = useCallback(
    async (id: string, options: PublishToWebOptions): Promise<PublishStatus | void> => {
      if (!isCloudApiAvailable()) return;
      if (!isVaultReadyForPublish()) return;
      try {
        if (selectedIdRef.current === id && !(await flushNow())) return;
        return await updatePublishedNoteOptions(id, options);
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [flushNow, t],
  );

  const handleUnpublish = useCallback(
    async (id: string) => {
      if (!isCloudApiAvailable()) {
        setActiveError(t('nordly.notes.menu.publish_requires_cloud'));
        return;
      }
      try {
        await unpublishNoteFromWeb(id);
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [t],
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      try {
        if (saveTimer.current !== null) {
          window.clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        if (selectedIdRef.current === id) {
          setActive(null);
          setDraftTitle('');
          setDraftBody('');
          draftRef.current = { title: '', body: '', activeId: '' };
        }
        await deleteNote(id);
        setList((prev) => {
          const notes = prev.notes.filter((n) => n.id !== id);
          if (selectedIdRef.current === id) {
            const next = notes[0]?.id ?? null;
            setSelectedId(next);
            if (!next) {
              setActive(null);
              setDraftTitle('');
              setDraftBody('');
            }
          }
          return { ...prev, notes };
        });
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [t],
  );

  const noteTitles = useMemo(
    () => list.notes.map((n) => n.title).filter((title) => title.trim().length > 0),
    [list.notes],
  );

  const handleWikiLinkClick = useCallback(
    async (linkText: string) => {
      if (!(await flushNow())) return;
      try {
        const { noteId, created } = await openWikiLink(linkText);
        const note = await getNote(noteId);
        if (created) {
          setList((prev) => ({
            ...prev,
            notes: [
              {
                id: note.id,
                title: note.title,
                updatedAt: note.updatedAt,
                sizeBytes: note.sizeBytes,
                folderId: note.folderId ?? null,
              },
              ...prev.notes,
            ],
          }));
        }
        setSelectedId(noteId);
        setActive(note);
        setDraftTitle(note.title);
        setDraftBody(note.bodyMd);
        setActiveError(null);
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [flushNow, t],
  );

  const SIDEBAR_W = VAULT_SIDEBAR_W;

  return (
    <div
      className="nordly-vault"
      onDragEnter={onFileDragEnter}
      onDragOver={onFileDragOver}
      onDragLeave={onFileDragLeave}
      onDrop={(e) => void handleFileDrop(e)}
    >
      <aside
        className="nordly-vault-sidebar-wrap"
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        style={{ width: sidebarCollapsed ? 0 : SIDEBAR_W }}
      >
        <div className="nordly-vault-sidebar-wrap__inner" style={{ width: SIDEBAR_W }}>
          <Sidebar
            list={list}
            folders={folders}
            selectedId={selectedId}
            onSelect={onSelectNote}
            onCreateNote={handleCreate}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveNote={handleMoveNote}
            onFocusFolder={handleFocusFolder}
            onPublish={handlePublish}
            onUpdatePublishOptions={handleUpdatePublishOptions}
            onUnpublish={handleUnpublish}
            onDelete={handleDeleteNote}
          />
        </div>
      </aside>

      <NotesSidebarDivider
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(true)}
      />

      <div className="nordly-vault-main">
        {sidebarCollapsed && <NotesSidebarEdge onExpand={() => setSidebarCollapsed(false)} />}
        <Editor
          list={list}
          active={active}
          activeError={activeError}
          draftTitle={draftTitle}
          draftBody={draftBody}
          saveStatus={saveStatus}
          noteTitles={noteTitles}
          editorZoom={editorZoom}
          onTitleChange={setDraftTitle}
          onBodyChange={setDraftBody}
          onWikiLinkClick={(linkText) => void handleWikiLinkClick(linkText)}
          onCreate={handleCreate}
          onRetryList={loadList}
        />
      </div>

      <FileDropOverlay active={fileDropActive} />
    </div>
  );
}
