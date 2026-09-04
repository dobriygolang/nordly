import { useCallback } from 'react';

import type { TFunc } from '@nordly-i18n';

import {
  collectSubtreeIds,
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  getNote,
  getNotesCloudCapability,
  moveFolderWithRemap,
  moveNoteToFolder,
  nextUniqueFolderName,
  openWikiLink,
  publishNoteToWeb,
  renameFolderWithRemap,
  unpublishNoteFromWeb,
  updatePublishedNoteOptions,
  type Note,
  type NoteFolder,
  type PublishStatus,
  type PublishToWebOptions,
} from '@features/notes/api/notesClient';
import { remapVaultPath } from '@features/notes/api/vault';
import { requireCloudCta } from '@shared/api/cloudCta';
import { isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { isVaultReadyForPublish } from '@shared/crypto/vaultPublish';
import { errorMessage, type ListState } from './utils';
import type { NoteDraftSnapshot, NoteSavedSnapshot } from './noteDraftSafety';

export function useNotesPageActions({
  t,
  folders,
  list,
  createTargetFolderId,
  focusFolderIdRef,
  selectedIdRef,
  draftRef,
  lastSavedRef,
  saveTimer,
  loadList,
  flushNow,
  setFolders,
  setList,
  setSelectedId,
  setActive,
  setDraftTitle,
  setDraftBody,
  setActiveError,
  setCreateTargetFolderId,
  bumpEditorSession,
}: {
  t: TFunc;
  folders: NoteFolder[];
  list: ListState;
  createTargetFolderId: string | null;
  focusFolderIdRef: React.MutableRefObject<string | null>;
  selectedIdRef: React.MutableRefObject<string | null>;
  draftRef: React.MutableRefObject<NoteDraftSnapshot>;
  lastSavedRef: React.MutableRefObject<NoteSavedSnapshot>;
  saveTimer: React.MutableRefObject<number | null>;
  loadList: () => void;
  flushNow: () => Promise<boolean>;
  setFolders: React.Dispatch<React.SetStateAction<NoteFolder[]>>;
  setList: React.Dispatch<React.SetStateAction<ListState>>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setActive: React.Dispatch<React.SetStateAction<Note | null>>;
  setDraftTitle: React.Dispatch<React.SetStateAction<string>>;
  setDraftBody: React.Dispatch<React.SetStateAction<string>>;
  setActiveError: React.Dispatch<React.SetStateAction<string | null>>;
  setCreateTargetFolderId: React.Dispatch<React.SetStateAction<string | null>>;
  bumpEditorSession: () => void;
}) {
  const prependAndSelectNote = useCallback(
    (n: Note, select = true) => {
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
      if (!select) return;
      selectedIdRef.current = n.id;
      draftRef.current = {
        activeId: n.id,
        title: n.title,
        body: n.bodyMd,
        revision: draftRef.current.revision + 1,
      };
      lastSavedRef.current = {
        activeId: n.id,
        title: n.title,
        body: n.bodyMd,
      };
      setSelectedId(n.id);
      setActive(n);
      setDraftTitle(n.title);
      setDraftBody(n.bodyMd);
      setActiveError(null);
      bumpEditorSession();
    },
    [
      bumpEditorSession,
      draftRef,
      lastSavedRef,
      selectedIdRef,
      setActive,
      setActiveError,
      setDraftBody,
      setDraftTitle,
      setList,
      setSelectedId,
    ],
  );

  const handleCreate = useCallback(
    async (folderId?: string | null) => {
      if (!(await flushNow())) return;
      const selectedAtStart = selectedIdRef.current;
      const draftRevisionAtStart = draftRef.current.revision;
      try {
        const parent = folderId === undefined ? focusFolderIdRef.current : folderId;
        if (parent) setCreateTargetFolderId(parent);
        const n = await createNote(t('nordly.notes.untitled'), '', parent);
        prependAndSelectNote(
          n,
          selectedIdRef.current === selectedAtStart &&
            draftRef.current.revision === draftRevisionAtStart,
        );
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [
      draftRef,
      flushNow,
      focusFolderIdRef,
      prependAndSelectNote,
      selectedIdRef,
      setActiveError,
      setCreateTargetFolderId,
      t,
    ],
  );

  const handleCreateFolder = useCallback(
    async (parentId?: string | null): Promise<NoteFolder> => {
      try {
        const parent = parentId === undefined ? createTargetFolderId : parentId;
        if (parentId !== undefined) setCreateTargetFolderId(parent);
        const base = t('nordly.notes.folder.default_name');
        const siblings = folders.filter((f) => (f.parentId ?? null) === parent);
        const name = nextUniqueFolderName(
          base,
          siblings.map((f) => f.name),
        );
        const folder = await createFolder(name, parent);
        setFolders((prev) => {
          const idx = prev.findIndex((f) => f.id === folder.id);
          if (idx < 0) return [...prev, folder];
          const next = prev.slice();
          next[idx] = folder;
          return next;
        });
        return folder;
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
        throw err;
      }
    },
    [createTargetFolderId, folders, setActiveError, setCreateTargetFolderId, setFolders, t],
  );

  const applyFolderPathRemap = useCallback(
    (fromPath: string, toPath: string) => {
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
          selectedIdRef.current = next;
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
          if (draftRef.current.activeId === sel) {
            draftRef.current = {
              ...draftRef.current,
              activeId: next,
              revision: draftRef.current.revision + 1,
            };
          }
          if (lastSavedRef.current.activeId === sel) {
            lastSavedRef.current = { ...lastSavedRef.current, activeId: next };
          }
        }
      }
      if (createTargetFolderId) {
        const nextFolder = mapId(createTargetFolderId);
        if (nextFolder !== createTargetFolderId) setCreateTargetFolderId(nextFolder);
      }
    },
    [
      createTargetFolderId,
      draftRef,
      lastSavedRef,
      selectedIdRef,
      setActive,
      setCreateTargetFolderId,
      setFolders,
      setList,
      setSelectedId,
    ],
  );

  const handleRenameFolder = useCallback(
    async (id: string, name: string) => {
      if (!(await flushNow())) return;
      try {
        const { folder, fromPath, toPath } = await renameFolderWithRemap(id, name);
        if (fromPath !== toPath) {
          applyFolderPathRemap(fromPath, toPath);
          setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
        } else {
          setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
        }
        loadList();
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [applyFolderPathRemap, flushNow, loadList, setActiveError, setFolders, t],
  );

  const handleDeleteFolder = useCallback(
    async (id: string) => {
      const selectedBeforeFlush = selectedIdRef.current;
      const subtree = new Set(collectSubtreeIds(folders, id));
      const selectedFolderId = list.notes.find(
        (note) => note.id === selectedBeforeFlush,
      )?.folderId;
      const deletingOpen =
        selectedBeforeFlush !== null &&
        selectedFolderId != null &&
        subtree.has(selectedFolderId);
      if (!(await flushNow())) return;
      const selectedAfterFlush = selectedIdRef.current;
      if (deletingOpen) {
        selectedIdRef.current = null;
        setSelectedId(null);
        setActive(null);
        setDraftTitle('');
        setDraftBody('');
        draftRef.current = {
          title: '',
          body: '',
          activeId: '',
          revision: draftRef.current.revision + 1,
        };
        lastSavedRef.current = { title: '', body: '', activeId: '' };
      }
      try {
        const { deletedFolderIds, deletedNoteIds } = await deleteFolder(id);
        const deletedFolders = new Set(deletedFolderIds);
        const deletedNotes = new Set(deletedNoteIds);
        setFolders((prev) => prev.filter((f) => !deletedFolders.has(f.id)));
        setList((prev) => {
          const notes = prev.notes.filter((n) => !deletedNotes.has(n.id));
          if (deletingOpen) {
            const next = notes[0]?.id ?? null;
            selectedIdRef.current = next;
            setSelectedId(next);
            setActive(null);
            bumpEditorSession();
          }
          return { ...prev, notes };
        });
        if (createTargetFolderId && deletedFolders.has(createTargetFolderId)) {
          setCreateTargetFolderId(null);
        }
        loadList();
      } catch (err: unknown) {
        if (deletingOpen && selectedAfterFlush) {
          selectedIdRef.current = selectedAfterFlush;
          setSelectedId(selectedAfterFlush);
          loadList();
        }
        setActiveError(errorMessage(err, t));
        throw err;
      }
    },
    [
      bumpEditorSession,
      createTargetFolderId,
      draftRef,
      folders,
      flushNow,
      lastSavedRef,
      list.notes,
      loadList,
      selectedIdRef,
      setActive,
      setActiveError,
      setCreateTargetFolderId,
      setDraftBody,
      setDraftTitle,
      setFolders,
      setList,
      setSelectedId,
      t,
    ],
  );

  const handleMoveNote = useCallback(
    async (noteId: string, folderId: string | null) => {
      const movingSelected = selectedIdRef.current === noteId;
      if (movingSelected && !(await flushNow())) return;
      const sourceId =
        movingSelected && draftRef.current.activeId
          ? draftRef.current.activeId
          : noteId;
      const previous =
        list.notes.find((n) => n.id === sourceId || n.id === noteId)?.folderId ?? null;
      setList((prev) => ({
        ...prev,
        notes: prev.notes.map((n) => (n.id === sourceId ? { ...n, folderId } : n)),
      }));
      try {
        const moved = await moveNoteToFolder(sourceId, folderId);
        if (moved.noteId !== sourceId) {
          setList((prev) => ({
            ...prev,
            notes: prev.notes.map((n) =>
              n.id === sourceId ? { ...n, id: moved.noteId, folderId: moved.folderId } : n,
            ),
          }));
          if (selectedIdRef.current === sourceId) {
            selectedIdRef.current = moved.noteId;
            setSelectedId(moved.noteId);
            setActive((cur) =>
              cur && cur.id === sourceId
                ? { ...cur, id: moved.noteId, folderId: moved.folderId }
                : cur,
            );
            if (draftRef.current.activeId === sourceId) {
              draftRef.current = {
                ...draftRef.current,
                activeId: moved.noteId,
                revision: draftRef.current.revision + 1,
              };
            }
            if (lastSavedRef.current.activeId === sourceId) {
              lastSavedRef.current = {
                ...lastSavedRef.current,
                activeId: moved.noteId,
              };
            }
          }
        } else {
          setList((prev) => ({
            ...prev,
            notes: prev.notes.map((n) =>
              n.id === sourceId ? { ...n, folderId: moved.folderId } : n,
            ),
          }));
        }
      } catch (err: unknown) {
        setList((prev) => ({
          ...prev,
          notes: prev.notes.map((n) =>
            n.id === sourceId ? { ...n, folderId: previous } : n,
          ),
        }));
        setActiveError(errorMessage(err, t));
        throw err;
      }
    },
    [
      draftRef,
      flushNow,
      lastSavedRef,
      list.notes,
      selectedIdRef,
      setActive,
      setActiveError,
      setList,
      setSelectedId,
      t,
    ],
  );

  const handleMoveFolder = useCallback(
    async (folderId: string, parentId: string | null) => {
      if (!(await flushNow())) return;
      const previous = folders.find((f) => f.id === folderId)?.parentId ?? null;
      setFolders((prev) =>
        prev.map((f) =>
          f.id === folderId ? { ...f, parentId, updatedAt: new Date().toISOString() } : f,
        ),
      );
      try {
        const { folder, fromPath, toPath } = await moveFolderWithRemap(folderId, parentId);
        if (fromPath !== toPath) {
          applyFolderPathRemap(fromPath, toPath);
          setFolders((prev) => prev.map((f) => (f.id === folder.id ? folder : f)));
        } else {
          setFolders((prev) => prev.map((f) => (f.id === folderId ? folder : f)));
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
    [applyFolderPathRemap, flushNow, folders, loadList, setActiveError, setFolders, t],
  );

  const handleFocusFolder = useCallback(
    (folderId: string | null) => {
      setCreateTargetFolderId(folderId);
    },
    [setCreateTargetFolderId],
  );

  const requirePublishCloud = useCallback(async (): Promise<boolean> => {
    const capability = await getNotesCloudCapability();
    if (!capability.available) {
      setActiveError(capability.message);
      return false;
    }
    const cta = await requireCloudCta();
    if (!cta.ok) {
      if (cta.reason !== 'cancelled') {
        setActiveError(t('nordly.notes.menu.publish_requires_cloud'));
      }
      return false;
    }
    if (!isVaultReadyForPublish()) {
      setActiveError(t('nordly.settings.vault.locked_publish'));
      return false;
    }
    return true;
  }, [setActiveError, t]);

  const handlePublish = useCallback(
    async (id: string, options: PublishToWebOptions): Promise<PublishStatus | void> => {
      if (!(await requirePublishCloud())) return;
      if (isVaultEnabledSync()) {
        const ok = window.confirm(t('nordly.notes.menu.publish_e2ee_warning'));
        if (!ok) return;
      }
      try {
        const publishingSelected = selectedIdRef.current === id;
        if (publishingSelected && !(await flushNow())) return;
        const currentId =
          publishingSelected && draftRef.current.activeId
            ? draftRef.current.activeId
            : id;
        return await publishNoteToWeb(currentId, options);
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [draftRef, flushNow, requirePublishCloud, selectedIdRef, setActiveError, t],
  );

  const handleUpdatePublishOptions = useCallback(
    async (id: string, options: PublishToWebOptions): Promise<PublishStatus | void> => {
      if (!(await requirePublishCloud())) return;
      try {
        const updatingSelected = selectedIdRef.current === id;
        if (updatingSelected && !(await flushNow())) return;
        const currentId =
          updatingSelected && draftRef.current.activeId
            ? draftRef.current.activeId
            : id;
        return await updatePublishedNoteOptions(currentId, options);
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [draftRef, flushNow, requirePublishCloud, selectedIdRef, setActiveError, t],
  );

  const handleUnpublish = useCallback(
    async (id: string) => {
      if (!(await requirePublishCloud())) return;
      try {
        const unpublishingSelected = selectedIdRef.current === id;
        if (unpublishingSelected && !(await flushNow())) return;
        const currentId =
          unpublishingSelected && draftRef.current.activeId
            ? draftRef.current.activeId
            : id;
        await unpublishNoteFromWeb(currentId);
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [draftRef, flushNow, requirePublishCloud, selectedIdRef, setActiveError, t],
  );

  const handleDeleteNotes = useCallback(
    async (ids: string[]) => {
      let unique = [...new Set(ids)];
      if (unique.length === 0) return;
      let restoreOpenId: string | null = null;
      try {
        const selectedBeforeFlush = selectedIdRef.current;
        const deletingOpen =
          selectedBeforeFlush !== null && unique.includes(selectedBeforeFlush);
        if (deletingOpen) {
          if (!(await flushNow())) return;
          const currentOpenId = draftRef.current.activeId || selectedIdRef.current;
          if (currentOpenId && currentOpenId !== selectedBeforeFlush) {
            unique = unique.map((id) => (id === selectedBeforeFlush ? currentOpenId : id));
          }
          restoreOpenId = currentOpenId;
          if (currentOpenId) {
            unique = [
              ...unique.filter((id) => id !== currentOpenId),
              currentOpenId,
            ];
          }
          if (saveTimer.current !== null) {
            window.clearTimeout(saveTimer.current);
            saveTimer.current = null;
          }
          selectedIdRef.current = null;
          setSelectedId(null);
          setActive(null);
          setDraftTitle('');
          setDraftBody('');
          draftRef.current = {
            title: '',
            body: '',
            activeId: '',
            revision: draftRef.current.revision + 1,
          };
          lastSavedRef.current = { title: '', body: '', activeId: '' };
        }
        for (const id of unique) {
          await deleteNote(id);
        }
        const removed = new Set([...ids, ...unique]);
        setList((prev) => {
          const notes = prev.notes.filter((n) => !removed.has(n.id));
          if (deletingOpen) {
            const next = notes[0]?.id ?? null;
            selectedIdRef.current = next;
            setSelectedId(next);
            bumpEditorSession();
            if (!next) {
              setActive(null);
              setDraftTitle('');
              setDraftBody('');
            }
          }
          return { ...prev, notes };
        });
        loadList();
      } catch (err: unknown) {
        const selected = selectedIdRef.current;
        if (!selected && restoreOpenId) {
          selectedIdRef.current = restoreOpenId;
          setSelectedId(restoreOpenId);
        }
        loadList();
        setActiveError(errorMessage(err, t));
      }
    },
    [
      bumpEditorSession,
      draftRef,
      flushNow,
      lastSavedRef,
      loadList,
      saveTimer,
      selectedIdRef,
      setActive,
      setActiveError,
      setDraftBody,
      setDraftTitle,
      setList,
      setSelectedId,
      t,
    ],
  );

  const handleDeleteNote = useCallback(
    async (id: string) => {
      await handleDeleteNotes([id]);
    },
    [handleDeleteNotes],
  );

  const handleWikiLinkClick = useCallback(
    async (linkText: string) => {
      if (!(await flushNow())) return;
      const selectedAtStart = selectedIdRef.current;
      const draftRevisionAtStart = draftRef.current.revision;
      try {
        const { noteId, created } = await openWikiLink(linkText);
        if (selectedIdRef.current === noteId) {
          setActiveError(null);
          return;
        }
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
        if (
          selectedIdRef.current !== selectedAtStart ||
          draftRef.current.revision !== draftRevisionAtStart
        ) {
          return;
        }
        bumpEditorSession();
        selectedIdRef.current = note.id;
        draftRef.current = {
          activeId: note.id,
          title: note.title,
          body: note.bodyMd,
          revision: draftRef.current.revision + 1,
        };
        lastSavedRef.current = {
          activeId: note.id,
          title: note.title,
          body: note.bodyMd,
        };
        setSelectedId(note.id);
        setActive(note);
        setDraftTitle(note.title);
        setDraftBody(note.bodyMd);
        setActiveError(null);
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
      }
    },
    [
      bumpEditorSession,
      draftRef,
      flushNow,
      lastSavedRef,
      selectedIdRef,
      setActive,
      setActiveError,
      setDraftBody,
      setDraftTitle,
      setList,
      setSelectedId,
      t,
    ],
  );

  return {
    handleCreate,
    handleCreateFolder,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveNote,
    handleMoveFolder,
    handleFocusFolder,
    handlePublish,
    handleUpdatePublishOptions,
    handleUnpublish,
    handleDeleteNote,
    handleDeleteNotes,
    handleWikiLinkClick,
  };
}
