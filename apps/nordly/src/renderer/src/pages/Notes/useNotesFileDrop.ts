import { useCallback, useEffect, useRef, useState, type DragEvent as ReactDragEvent } from 'react';

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { TFunc } from '@nordly-i18n';

import {
  createNote,
  ensureFolderPath,
  updateNote,
  type Note,
  type NoteFolder,
} from '@features/notes/api/notesClient';
import type { MarkdownDraft } from '@features/notes/lib/importMarkdownFiles';
import { isTauriRuntime } from '@platform/runtime';
import { trackAsyncDisposer } from '@shared/lib/asyncDisposer';
import { errorMessage, type ListState } from './utils';
import type { NoteDraftSnapshot, NoteSavedSnapshot } from './noteDraftSafety';

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

function isFileDrag(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  return Array.from(dt.types).includes('Files');
}

function isMarkdownImportError(err: unknown): err is Error & { code: string } {
  return err instanceof Error && err.name === 'MarkdownImportError' && 'code' in err;
}

export function useNotesFileDrop({
  t,
  flushNow,
  focusFolderIdRef,
  selectedIdRef,
  draftRef,
  lastSavedRef,
  setList,
  setFolders,
  setSelectedId,
  setActive,
  setDraftTitle,
  setDraftBody,
  setActiveError,
  bumpEditorSession,
}: {
  t: TFunc;
  flushNow: () => Promise<boolean>;
  focusFolderIdRef: React.MutableRefObject<string | null>;
  selectedIdRef: React.MutableRefObject<string | null>;
  draftRef: React.MutableRefObject<NoteDraftSnapshot>;
  lastSavedRef: React.MutableRefObject<NoteSavedSnapshot>;
  setList: React.Dispatch<React.SetStateAction<ListState>>;
  setFolders: React.Dispatch<React.SetStateAction<NoteFolder[]>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setActive: React.Dispatch<React.SetStateAction<Note | null>>;
  setDraftTitle: React.Dispatch<React.SetStateAction<string>>;
  setDraftBody: React.Dispatch<React.SetStateAction<string>>;
  setActiveError: React.Dispatch<React.SetStateAction<string | null>>;
  bumpEditorSession: () => void;
}): {
  fileDropActive: boolean;
  onFileDragEnter: (e: ReactDragEvent) => void;
  onFileDragOver: (e: ReactDragEvent) => void;
  onFileDragLeave: (e: ReactDragEvent) => void;
  handleFileDrop: (e: ReactDragEvent) => Promise<void>;
} {
  const [fileDropActive, setFileDropActive] = useState(false);
  const fileDragDepthRef = useRef(0);

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
      const selectedAtStart = selectedIdRef.current;
      const draftRevisionAtStart = draftRef.current.revision;

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
        const canReplaceDraft =
          selectedIdRef.current === selectedAtStart &&
          draftRef.current.revision === draftRevisionAtStart;
        if (last && canReplaceDraft) {
          selectedIdRef.current = last.id;
          draftRef.current = {
            activeId: last.id,
            title: last.title,
            body: last.bodyMd,
            revision: draftRef.current.revision + 1,
          };
          lastSavedRef.current = {
            activeId: last.id,
            title: last.title,
            body: last.bodyMd,
          };
          setSelectedId(last.id);
          setActive(last);
          setDraftTitle(last.title);
          setDraftBody(last.bodyMd);
          bumpEditorSession();
        }
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
        } else if (last && canReplaceDraft) {
          setActiveError(null);
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
    [
      bumpEditorSession,
      draftRef,
      flushNow,
      focusFolderIdRef,
      importErrorMessage,
      lastSavedRef,
      selectedIdRef,
      setActive,
      setActiveError,
      setDraftBody,
      setDraftTitle,
      setFolders,
      setList,
      setSelectedId,
      t,
    ],
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
    [clearFileDrop, importErrorMessage, importMarkdownDrafts, setActiveError],
  );

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;

    type ImportEntry = { path: string; relativeDir: string; name: string };

    const collectTauriDrafts = async (paths: string[]): Promise<MarkdownDraft[]> => {
      const {
        basenameFromPath,
        folderSegmentsForDirEntry,
        isMarkdownFilename,
        joinImportRelative,
        parentDirFromPath,
        readMarkdownPath,
        MarkdownImportError,
      } = await loadMarkdownImport();
      const drafts: MarkdownDraft[] = [];
      let sawDirectory = false;

      const readText = (root: string, relativePath: string) =>
        invoke<string>('read_text_file', { root, relativePath });

      for (const path of paths) {
        const base = basenameFromPath(path);
        if (isMarkdownFilename(base)) {
          const root = parentDirFromPath(path);
          drafts.push(
            await readMarkdownPath(path, () => readText(root, base), []),
          );
          continue;
        }

        try {
          const entries = await invoke<ImportEntry[]>('list_markdown_import_entries', {
            root: path,
          });
          sawDirectory = true;
          const rootName = base;
          for (const entry of entries) {
            const relativePath = joinImportRelative(entry.relativeDir, entry.name);
            drafts.push(
              await readMarkdownPath(
                entry.path,
                () => readText(path, relativePath),
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
          if (msg.includes('not a directory')) continue;
          throw err;
        }
      }

      if (drafts.length === 0) {
        throw new MarkdownImportError(sawDirectory ? 'empty_folder' : 'only_md');
      }
      return drafts;
    };

    const stopListening = trackAsyncDisposer(
      getCurrentWindow().onDragDropEvent((event) => {
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
      }),
      (err) => {
        if (!disposed) setActiveError(importErrorMessage(err));
        else console.warn('[nordly:notes] drag listener cleanup failed', err);
      },
    );

    return () => {
      disposed = true;
      stopListening();
    };
  }, [clearFileDrop, importErrorMessage, importMarkdownDrafts, setActiveError, t]);

  return {
    fileDropActive,
    onFileDragEnter,
    onFileDragOver,
    onFileDragLeave,
    handleFileDrop,
  };
}
