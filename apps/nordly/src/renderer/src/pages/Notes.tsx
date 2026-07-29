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
  ensureFolderPath,
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
  nextUniqueFolderName,
  refreshNotesVaultBoundCache,
  isNotesVaultBound,
  renameFolderWithRemap,
  moveFolderWithRemap,
} from '@features/notes/api/notesClient';
import {
  listenVaultChanged,
  vaultStartWatch,
  vaultStopWatch,
  isVaultWatchSuppressed,
  deferVaultWatchReload,
  remapVaultPath,
  revokeVaultImageCache,
} from '@features/notes/vault';
import { getServerId } from '@shared/sync/idMap';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { subscribeVault } from '@shared/crypto/vault';
import { isVaultReadyForPublish } from '@shared/crypto/vaultPublish';
import { ensureCloudAuth } from '@shared/api/authSession';
import { isCloudApiAvailable, isCloudEnabled } from '@shared/sync/syncConfig';
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
import { VaultOnboarding } from './Notes/VaultOnboarding';
import { VAULT_SIDEBAR_W } from './vaultSidebar';
import { isTauriRuntime } from '@platform/runtime';
import type { EntityNavigationRequest } from '@shared/model/navigation';
import type { MarkdownDraft } from '@features/notes/lib/importMarkdownFiles';
import {
  NOTES_ZOOM_DEFAULT,
  loadNotesEditorZoom,
  saveNotesEditorZoom,
  stepNotesEditorZoom,
} from '@features/notes/lib/notesEditorZoom';

const SAVE_STATUS_FADE_MS = 1200;
const AUTOSAVE_DEBOUNCE_MS = 250;
const SIDEBAR_RESIZE_SETTLE_MS = 80;

/** Drop-path helpers — keep out of Notes cold-open static graph (bundle budgets). */
async function loadMarkdownImport() {
  return import('@features/notes/lib/importMarkdownFiles');
}

async function loadImportedImageRewrite() {
  const [{ rewriteImportedImages }, { mimeFromFilename }, { createNoteAttachment }] =
    await Promise.all([
      import('@features/notes/lib/rewriteImportedImages'),
      import('@features/notes/lib/noteAttachments'),
      import('@features/notes/api/attachmentsClient'),
    ]);
  return { rewriteImportedImages, mimeFromFilename, createNoteAttachment };
}

/** True when the drag payload is OS files (not note-row @dnd-kit). */
function isFileDrag(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  return Array.from(dt.types).includes('Files');
}

function isMarkdownImportError(err: unknown): err is Error & { code: string } {
  return err instanceof Error && err.name === 'MarkdownImportError' && 'code' in err;
}

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
  /** Where ⌘N / new folder land — only an explicitly selected folder, else unfiled. */
  const [createTargetFolderId, setCreateTargetFolderId] = useState<string | null>(null);
  focusFolderIdRef.current = createTargetFolderId;
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
  const [vaultReady, setVaultReady] = useState<boolean | null>(
    () => (isTauriRuntime() ? null : true),
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (err) {
      console.warn('[nordly:notes] sidebar collapse load failed', err);
      return false;
    }
  });
  const sidebarMountedRef = useRef(false);
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
    } catch (err) {
      console.warn('[nordly:notes] sidebar collapse persist failed', err);
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
    if (vaultReady !== true) return;
    loadList();
  }, [loadList, vaultReady]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      setVaultReady(true);
      return;
    }
    let cancelled = false;
    void refreshNotesVaultBoundCache()
      .then((bound) => {
        if (cancelled) return;
        setVaultReady(bound);
        if (bound) {
          void vaultStartWatch().catch((err) => {
            console.warn('[nordly:notes] vault watch start failed', err);
          });
        }
      })
      .catch((err) => {
        console.warn('[nordly:notes] vault bind check failed', err);
        if (!cancelled) setVaultReady(false);
      });
    return () => {
      cancelled = true;
      void vaultStopWatch().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const onNotesChanged = () => {
      void (async () => {
        const bound = await isNotesVaultBound();
        if (isTauriRuntime() && !bound) {
          setVaultReady(false);
          return;
        }
        setVaultReady(true);
        loadList();
      })();
    };
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
        if (n.id !== activeId) {
          setSelectedId(n.id);
          setList((prev) => ({
            ...prev,
            notes: prev.notes.map((row) =>
              row.id === activeId
                ? {
                    ...row,
                    id: n.id,
                    title: n.title,
                    updatedAt: n.updatedAt,
                    sizeBytes: n.sizeBytes,
                    folderId: n.folderId,
                  }
                : row,
            ),
          }));
        } else {
          setList((prev) => ({
            ...prev,
            notes: prev.notes.map((row) =>
              row.id === activeId
                ? { ...row, title: n.title, updatedAt: n.updatedAt, sizeBytes: n.sizeBytes }
                : row,
            ),
          }));
        }
        setActive(n);
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
    if (vaultReady !== true) return;
    revokeVaultImageCache();
  }, [vaultReady, selectedId]);

  useEffect(() => {
    return () => {
      revokeVaultImageCache();
    };
  }, []);

  useEffect(() => {
    if (vaultReady !== true) return;
    return listenVaultChanged(() => {
      const reload = () => {
        void (async () => {
          const id = selectedIdRef.current;
          const draft = draftRef.current;
          const dirty =
            Boolean(id) &&
            draft.activeId === id &&
            (draft.title !== lastSavedRef.current.title ||
              draft.body !== lastSavedRef.current.body);
          loadList();
          if (!id || dirty) return;
          try {
            const n = await getNote(id);
            if (selectedIdRef.current !== id) return;
            setActive(n);
            if (!isNoteVaultLocked(n)) {
              setDraftTitle(n.title);
              setDraftBody(n.bodyMd);
              lastSavedRef.current = { title: n.title, body: n.bodyMd };
            }
          } catch {
            // Active path removed externally — refresh selection via list.
            setActive(null);
            setSelectedId(null);
          }
        })();
      };
      if (isVaultWatchSuppressed()) {
        deferVaultWatchReload(reload);
        return;
      }
      reload();
    });
  }, [vaultReady, loadList]);

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
      const n = await createNote(t('nordly.notes.untitled'), '', folderId);
      prependAndSelectNote(n);
    } catch (err: unknown) {
      setActiveError(errorMessage(err, t));
    }
  }, [flushNow, prependAndSelectNote, t]);

  const clearFileDrop = useCallback(() => {
    fileDragDepthRef.current = 0;
    setFileDropActive(false);
  }, []);

  const importErrorMessage = useCallback(
    (err: unknown): string => {
      if (isMarkdownImportError(err)) {
        return t(`nordly.notes.file_drop.${err.code}`);
      }
      if (err instanceof Error) {
        if (err.message === 'too_many' || err.message === 'too_deep' || err.message === 'empty_folder') {
          return t(`nordly.notes.file_drop.${err.message}`);
        }
      }
      return errorMessage(err, t);
    },
    [t],
  );

  const importMarkdownDrafts = useCallback(
    async (drafts: MarkdownDraft[]) => {
      if (drafts.length === 0) {
        setActiveError(t('nordly.notes.file_drop.only_md'));
        return;
      }
      if (!(await flushNow())) return;

      const focusParent = focusFolderIdRef.current;
      const pathCache = new Map<string, string | null>();
      pathCache.set('', focusParent);

      let last: Note | null = null;
      let missingImageCount = 0;
      let imageWarningCount = 0;
      const createdFolders: NoteFolder[] = [];
      try {
        for (const draft of drafts) {
          const key = draft.folderSegments.join('\0');
          let folderId = pathCache.get(key);
          if (folderId === undefined) {
            const ensured = await ensureFolderPath(draft.folderSegments, focusParent);
            folderId = ensured.folderId;
            pathCache.set(key, folderId);
            createdFolders.push(...ensured.created);
          }

          let n = await createNote(draft.title, draft.bodyMd, folderId);

          if (draft.sourceDir && isTauriRuntime()) {
            const sourceDir = draft.sourceDir;
            const [{ basenameFromPath }, rewrite] = await Promise.all([
              loadMarkdownImport(),
              loadImportedImageRewrite(),
            ]);
            const { rewriteImportedImages, mimeFromFilename, createNoteAttachment } = rewrite;
            const rewritten = await rewriteImportedImages(
              n.id,
              n.bodyMd,
              async (rel) => {
                try {
                  const bytes = await invoke<number[]>('read_binary_file', {
                    root: sourceDir,
                    relativePath: rel,
                  });
                  const fileName = basenameFromPath(rel);
                  const mime = mimeFromFilename(fileName) || 'application/octet-stream';
                  return { bytes: new Uint8Array(bytes), fileName, mime };
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  if (/not_found|failed to resolve path/i.test(msg)) return null;
                  throw err instanceof Error ? err : new Error(msg);
                }
              },
              createNoteAttachment,
            );
            if (rewritten.bodyMd !== n.bodyMd) {
              n = await updateNote(n.id, n.title, rewritten.bodyMd);
            }
            missingImageCount += rewritten.missing.length;
            imageWarningCount += rewritten.warnings.length;
          }

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
              ...prev.notes.filter((x) => x.id !== n.id),
            ],
          }));
          last = n;
        }
        if (createdFolders.length > 0) {
          setFolders((prev) => {
            const ids = new Set(prev.map((f) => f.id));
            const merged = [...prev];
            for (const f of createdFolders) {
              if (!ids.has(f.id)) {
                merged.push(f);
                ids.add(f.id);
              }
            }
            return merged;
          });
        }
        if (last) {
          setSelectedId(last.id);
          setActive(last);
          setDraftTitle(last.title);
          setDraftBody(last.bodyMd);
          if (missingImageCount > 0 || imageWarningCount > 0) {
            const parts: string[] = [];
            if (missingImageCount > 0) {
              parts.push(
                t('nordly.notes.file_drop.images_missing', {
                  count: String(missingImageCount),
                }),
              );
            }
            if (imageWarningCount > 0) {
              parts.push(
                t('nordly.notes.file_drop.images_warnings', {
                  count: String(imageWarningCount),
                }),
              );
            }
            setActiveError(parts.join(' '));
          } else {
            setActiveError(null);
          }
        }
      } catch (err: unknown) {
        if (createdFolders.length > 0) {
          setFolders((prev) => {
            const ids = new Set(prev.map((f) => f.id));
            const merged = [...prev];
            for (const f of createdFolders) {
              if (!ids.has(f.id)) {
                merged.push(f);
                ids.add(f.id);
              }
            }
            return merged;
          });
        }
        setActiveError(importErrorMessage(err));
      }
    },
    [flushNow, importErrorMessage, t],
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

      try {
        const { collectBrowserMarkdownDrafts } = await loadMarkdownImport();
        const drafts = await collectBrowserMarkdownDrafts(e.dataTransfer);
        await importMarkdownDrafts(drafts);
      } catch (err: unknown) {
        setActiveError(importErrorMessage(err));
      }
    },
    [clearFileDrop, importErrorMessage, importMarkdownDrafts],
  );

  // Tauri WebView does not deliver OS file drops via HTML5 File API — use native paths.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    type ImportEntry = { path: string; relativeDir: string; name: string };

    const readText = (p: string) => invoke<string>('read_text_file', { path: p });

    const collectTauriDrafts = async (paths: string[]): Promise<MarkdownDraft[]> => {
      const {
        basenameFromPath,
        folderSegmentsForDirEntry,
        isMarkdownFilename,
        readMarkdownPath,
        MarkdownImportError,
      } = await loadMarkdownImport();
      const drafts: MarkdownDraft[] = [];
      let sawDirectory = false;

      for (const path of paths) {
        const base = basenameFromPath(path);
        if (isMarkdownFilename(base)) {
          drafts.push(await readMarkdownPath(path, readText, []));
          continue;
        }

        try {
          const entries = await invoke<ImportEntry[]>('list_markdown_import_entries', {
            root: path,
          });
          sawDirectory = true;
          const rootName = base;
          for (const entry of entries) {
            drafts.push(
              await readMarkdownPath(
                entry.path,
                readText,
                folderSegmentsForDirEntry(rootName, entry.relativeDir),
              ),
            );
          }
        } catch (err: unknown) {
          const msg =
            typeof err === 'string'
              ? err
              : err instanceof Error
                ? err.message
                : String(err);
          if (msg.includes('too_many')) {
            throw new MarkdownImportError('too_many');
          }
          if (msg.includes('too_deep')) {
            throw new MarkdownImportError('too_deep');
          }
          if (msg.includes('empty_folder')) {
            sawDirectory = true;
            continue;
          }
          // Not a directory (and not markdown) — skip.
          if (msg.includes('not a directory')) continue;
          throw err;
        }
      }

      if (drafts.length === 0) {
        throw new MarkdownImportError(sawDirectory ? 'empty_folder' : 'only_md');
      }
      return drafts;
    };

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

        const paths = payload.paths ?? [];
        if (paths.length === 0) {
          setActiveError(t('nordly.notes.file_drop.only_md'));
          return;
        }

        void (async () => {
          try {
            const drafts = await collectTauriDrafts(paths);
            if (!disposed) await importMarkdownDrafts(drafts);
          } catch (err: unknown) {
            if (!disposed) setActiveError(importErrorMessage(err));
          }
        })();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err: unknown) => {
        if (!disposed) setActiveError(importErrorMessage(err));
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [clearFileDrop, importErrorMessage, importMarkdownDrafts, t]);

  const handleCreateFolder = useCallback(async (): Promise<NoteFolder> => {
    try {
      const parentId = createTargetFolderId;
      const base = t('nordly.notes.folder.default_name');
      const siblings = folders.filter((f) => (f.parentId ?? null) === parentId);
      const name = nextUniqueFolderName(base, siblings.map((f) => f.name));
      const folder = await createFolder(name, parentId);
      // Upsert by id — create_dir_all is idempotent; a stale self-parent row from a
      // buggy list must not duplicate and blow the tree walk stack.
      setFolders((prev) => {
        const idx = prev.findIndex((f) => f.id === folder.id);
        if (idx < 0) return [...prev, folder];
        const next = prev.slice();
        next[idx] = folder;
        return next;
      });
      // Stay at the same create level so the next folder is a sibling, not a child.
      return folder;
    } catch (err: unknown) {
      setActiveError(errorMessage(err, t));
      throw err;
    }
  }, [createTargetFolderId, folders, t]);

  const applyFolderPathRemap = useCallback((fromPath: string, toPath: string) => {
    if (fromPath === toPath) return;
    const mapId = (id: string) => remapVaultPath(id, fromPath, toPath);
    setFolders((prev) =>
      prev.map((f) => ({
        ...f,
        id: mapId(f.id),
        parentId: f.parentId ? mapId(f.parentId) : null,
      })),
    );
    setList((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => ({
        ...n,
        id: mapId(n.id),
        folderId: n.folderId ? mapId(n.folderId) : null,
      })),
    }));
    const sel = selectedIdRef.current;
    if (sel) {
      const next = mapId(sel);
      if (next !== sel) {
        setSelectedId(next);
        setActive((cur) =>
          cur
            ? {
                ...cur,
                id: mapId(cur.id),
                folderId: cur.folderId ? mapId(cur.folderId) : null,
              }
            : cur,
        );
        draftRef.current = { ...draftRef.current, activeId: next };
      }
    }
    if (createTargetFolderId) {
      const nextFolder = mapId(createTargetFolderId);
      if (nextFolder !== createTargetFolderId) setCreateTargetFolderId(nextFolder);
    }
  }, [createTargetFolderId]);

  const handleRenameFolder = useCallback(
    (id: string, name: string) => {
      void renameFolderWithRemap(id, name)
        .then(({ folder, fromPath, toPath }) => {
          if (fromPath !== toPath) {
            applyFolderPathRemap(fromPath, toPath);
          } else {
            setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
          }
          loadList();
        })
        .catch((err: unknown) => {
          setActiveError(errorMessage(err, t));
        });
    },
    [applyFolderPathRemap, loadList, t],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        const { deletedFolderIds, deletedNoteIds } = await deleteFolder(id);
        const deletedFolders = new Set(deletedFolderIds);
        const deletedNotes = new Set(deletedNoteIds);
        setFolders((prev) => prev.filter((f) => !deletedFolders.has(f.id)));
        setList((prev) => {
          const notes = prev.notes.filter((n) => !deletedNotes.has(n.id));
          if (selectedIdRef.current && deletedNotes.has(selectedIdRef.current)) {
            const next = notes[0]?.id ?? null;
            setSelectedId(next);
            setActive(null);
            setDraftTitle('');
            setDraftBody('');
            draftRef.current = { title: '', body: '', activeId: '' };
          }
          return { ...prev, notes };
        });
        if (createTargetFolderId && deletedFolders.has(createTargetFolderId)) {
          setCreateTargetFolderId(null);
        }
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
        throw err;
      }
    },
    [createTargetFolderId, t],
  );

  const handleMoveNote = useCallback(
    async (noteId: string, folderId: string | null) => {
      const previous =
        list.notes.find((n) => n.id === noteId)?.folderId ?? null;
      setList((prev) => ({
        ...prev,
        notes: prev.notes.map((n) => (n.id === noteId ? { ...n, folderId } : n)),
      }));
      try {
        const moved = await moveNoteToFolder(noteId, folderId);
        if (moved.noteId !== noteId) {
          setList((prev) => ({
            ...prev,
            notes: prev.notes.map((n) =>
              n.id === noteId
                ? { ...n, id: moved.noteId, folderId: moved.folderId }
                : n,
            ),
          }));
          if (selectedIdRef.current === noteId) {
            setSelectedId(moved.noteId);
            setActive((cur) =>
              cur && cur.id === noteId
                ? { ...cur, id: moved.noteId, folderId: moved.folderId }
                : cur,
            );
            draftRef.current = { ...draftRef.current, activeId: moved.noteId };
          }
        } else {
          setList((prev) => ({
            ...prev,
            notes: prev.notes.map((n) =>
              n.id === noteId ? { ...n, folderId: moved.folderId } : n,
            ),
          }));
        }
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

  const handleMoveFolder = useCallback(
    async (folderId: string, parentId: string | null) => {
      const previous = folders.find((f) => f.id === folderId)?.parentId ?? null;
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId
            ? { ...f, parentId, updatedAt: new Date().toISOString() }
            : f,
        ),
      );
      try {
        const { folder, fromPath, toPath } = await moveFolderWithRemap(
          folderId,
          parentId,
        );
        if (fromPath !== toPath) {
          applyFolderPathRemap(fromPath, toPath);
        } else {
          setFolders((prev) =>
            prev.map((f) => (f.id === folderId ? folder : f)),
          );
        }
        loadList();
      } catch (err: unknown) {
        setFolders((prev) =>
          prev.map((f) => (f.id === folderId ? { ...f, parentId: previous } : f)),
        );
        setActiveError(errorMessage(err, t));
        throw err;
      }
    },
    [applyFolderPathRemap, folders, loadList, t],
  );

  const handleFocusFolder = useCallback((folderId: string | null) => {
    setCreateTargetFolderId(folderId);
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
      if (!isCloudEnabled()) {
        setActiveError(t('nordly.notes.menu.publish_requires_cloud'));
        return;
      }
      if (!(await ensureCloudAuth())) return;
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
      if (!isCloudEnabled()) return;
      if (!(await ensureCloudAuth())) return;
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
      if (!isCloudEnabled()) {
        setActiveError(t('nordly.notes.menu.publish_requires_cloud'));
        return;
      }
      if (!(await ensureCloudAuth())) return;
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

  const handleDeleteNotes = useCallback(
    async (ids: string[]) => {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return;
      try {
        if (saveTimer.current !== null) {
          window.clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        const deletingOpen =
          selectedIdRef.current !== null && unique.includes(selectedIdRef.current);
        if (deletingOpen) {
          setActive(null);
          setDraftTitle('');
          setDraftBody('');
          draftRef.current = { title: '', body: '', activeId: '' };
        }
        for (const id of unique) {
          await deleteNote(id);
        }
        const removed = new Set(unique);
        setList((prev) => {
          const notes = prev.notes.filter((n) => !removed.has(n.id));
          if (deletingOpen) {
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

  const handleDeleteNote = useCallback(
    async (id: string) => {
      await handleDeleteNotes([id]);
    },
    [handleDeleteNotes],
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

  if (vaultReady === null) {
    return <div className="nordly-vault" />;
  }

  if (vaultReady === false) {
    return (
      <div className="nordly-vault">
        <div className="nordly-vault-main">
          <VaultOnboarding
            onBound={(result) => {
              setVaultReady(true);
              if (result?.skippedLocked) {
                setActiveError(
                  t('nordly.notes.vault_onboarding.skipped_locked').replace(
                    '{{count}}',
                    String(result.skippedLocked),
                  ),
                );
              }
              loadList();
            }}
          />
        </div>
      </div>
    );
  }

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
            createTargetFolderId={createTargetFolderId}
            onSelect={onSelectNote}
            onCreateNote={handleCreate}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveNote={handleMoveNote}
            onMoveFolder={handleMoveFolder}
            onFocusFolder={handleFocusFolder}
            onPublish={handlePublish}
            onUpdatePublishOptions={handleUpdatePublishOptions}
            onUnpublish={handleUnpublish}
            onDelete={handleDeleteNote}
            onDeleteMany={handleDeleteNotes}
            onError={setActiveError}
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
          onError={setActiveError}
        />
      </div>

      <FileDropOverlay active={fileDropActive} />
    </div>
  );
}
