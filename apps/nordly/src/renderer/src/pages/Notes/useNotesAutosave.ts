import { useCallback, useEffect, useRef, useState } from 'react';

import { getCurrentWindow } from '@tauri-apps/api/window';
import type { TFunc } from '@nordly-i18n';

import {
  getNote,
  isNoteVaultLocked,
  updateNote,
  type Note,
} from '@features/notes/api/notesClient';
import { isTauriRuntime } from '@platform/runtime';
import { trackAsyncDisposer } from '@shared/lib/asyncDisposer';
import { errorMessage, type ListState } from './utils';
import { NoteSaveStatus, type NoteSaveStatus as SaveStatus } from './saveStatus';
import {
  canApplyNoteLoad,
  captureNoteLoadGuard,
  isNoteDraftDirty,
  type NoteDraftSnapshot,
  type NoteSavedSnapshot,
} from './noteDraftSafety';

const SAVE_STATUS_FADE_MS = 1200;
const AUTOSAVE_DEBOUNCE_MS = 250;

export function useNotesAutosave({
  t,
  selectedId,
  selectedIdRef,
  active,
  activeRef,
  setSelectedId,
  setList,
  setActive,
  setActiveError,
  onRegisterFlush,
}: {
  t: TFunc;
  selectedId: string | null;
  selectedIdRef: React.MutableRefObject<string | null>;
  active: Note | null;
  activeRef: React.MutableRefObject<Note | null>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setList: React.Dispatch<React.SetStateAction<ListState>>;
  setActive: React.Dispatch<React.SetStateAction<Note | null>>;
  setActiveError: React.Dispatch<React.SetStateAction<string | null>>;
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
}): {
  draftTitle: string;
  draftBody: string;
  setDraftTitle: React.Dispatch<React.SetStateAction<string>>;
  setDraftBody: React.Dispatch<React.SetStateAction<string>>;
  saveStatus: SaveStatus;
  flushNow: () => Promise<boolean>;
  acceptLoadedNote: (note: Note) => void;
  draftRef: React.MutableRefObject<NoteDraftSnapshot>;
  lastSavedRef: React.MutableRefObject<NoteSavedSnapshot>;
  saveTimer: React.MutableRefObject<number | null>;
} {
  const [draftTitle, setDraftTitleState] = useState('');
  const [draftBody, setDraftBodyState] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(NoteSaveStatus.Idle);
  const saveTimer = useRef<number | null>(null);
  const saveStatusTimer = useRef<number | null>(null);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const prevSelectedIdForFlush = useRef<string | null>(selectedId);
  const loadGenerationRef = useRef(0);
  const draftRef = useRef<NoteDraftSnapshot>({
    title: '',
    body: '',
    activeId: '',
    revision: 0,
  });
  const renderedActiveId = active?.id ?? '';
  if (draftRef.current.activeId !== renderedActiveId) {
    draftRef.current = {
      ...draftRef.current,
      activeId: renderedActiveId,
      revision: draftRef.current.revision + 1,
    };
  }
  const lastSavedRef = useRef<NoteSavedSnapshot>({
    title: '',
    body: '',
    activeId: '',
  });

  const setDraftTitle = useCallback<React.Dispatch<React.SetStateAction<string>>>((value) => {
    const previous = draftRef.current.title;
    const next =
      typeof value === 'function'
        ? (value as (current: string) => string)(previous)
        : value;
    if (next !== previous) {
      draftRef.current = {
        ...draftRef.current,
        title: next,
        revision: draftRef.current.revision + 1,
      };
    }
    setDraftTitleState(next);
  }, []);

  const setDraftBody = useCallback<React.Dispatch<React.SetStateAction<string>>>((value) => {
    const previous = draftRef.current.body;
    const next =
      typeof value === 'function'
        ? (value as (current: string) => string)(previous)
        : value;
    if (next !== previous) {
      draftRef.current = {
        ...draftRef.current,
        body: next,
        revision: draftRef.current.revision + 1,
      };
    }
    setDraftBodyState(next);
  }, []);

  const acceptLoadedNote = useCallback((note: Note): void => {
    const current = draftRef.current;
    draftRef.current = {
      activeId: note.id,
      title: note.title,
      body: note.bodyMd,
      // Every accepted read invalidates other in-flight reads, even when its
      // text happens to match the current draft.
      revision: current.revision + 1,
    };
    lastSavedRef.current = {
      activeId: note.id,
      title: note.title,
      body: note.bodyMd,
    };
    setDraftTitleState(note.title);
    setDraftBodyState(note.bodyMd);
  }, []);

  const saveUntilCurrent = useCallback(async (): Promise<boolean> => {
    for (;;) {
      const snapshot = { ...draftRef.current };
      if (!snapshot.activeId) return true;
      if (activeRef.current && isNoteVaultLocked(activeRef.current)) return true;
      if (!isNoteDraftDirty(snapshot, lastSavedRef.current)) return true;

      setSaveStatus(NoteSaveStatus.Saving);
      try {
        const n = await updateNote(snapshot.activeId, snapshot.title, snapshot.body);
        const renamed = n.id !== snapshot.activeId;
        const ownsEditor = selectedIdRef.current === snapshot.activeId;

        if (renamed && ownsEditor) {
          selectedIdRef.current = n.id;
          setSelectedId(n.id);
        }

        setList((prev) => ({
          ...prev,
          notes: prev.notes.map((row) =>
            row.id === snapshot.activeId
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

        if (renamed && draftRef.current.activeId === snapshot.activeId) {
          draftRef.current = {
            ...draftRef.current,
            activeId: n.id,
            revision: draftRef.current.revision + 1,
          };
        }

        const currentId = renamed ? n.id : snapshot.activeId;
        if (draftRef.current.activeId !== currentId) {
          return true;
        }

        lastSavedRef.current = {
          activeId: currentId,
          title: n.title,
          body: n.bodyMd,
        };
        if (ownsEditor) setActive(n);

        const latest = draftRef.current;
        const latestMatchesSavedRequest =
          latest.title === snapshot.title && latest.body === snapshot.body;
        if (!latestMatchesSavedRequest) {
          continue;
        }

        if (latest.title !== n.title || latest.body !== n.bodyMd) {
          acceptLoadedNote(n);
        }
        setSaveStatus(NoteSaveStatus.Saved);
        if (saveStatusTimer.current !== null) {
          window.clearTimeout(saveStatusTimer.current);
        }
        saveStatusTimer.current = window.setTimeout(() => {
          saveStatusTimer.current = null;
          setSaveStatus((cur) => (cur === NoteSaveStatus.Saved ? NoteSaveStatus.Idle : cur));
        }, SAVE_STATUS_FADE_MS);
        return true;
      } catch (err: unknown) {
        setActiveError(errorMessage(err, t));
        setSaveStatus(NoteSaveStatus.Idle);
        return false;
      }
    }
  }, [
    acceptLoadedNote,
    activeRef,
    selectedIdRef,
    setActive,
    setActiveError,
    setList,
    setSelectedId,
    t,
  ]);

  const flushNow = useCallback((): Promise<boolean> => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const inFlight = saveInFlightRef.current;
    if (inFlight) return inFlight;

    const save = saveUntilCurrent();
    saveInFlightRef.current = save;
    void save.finally(() => {
      if (saveInFlightRef.current === save) saveInFlightRef.current = null;
    });
    return save;
  }, [saveUntilCurrent]);

  useEffect(() => {
    const prev = prevSelectedIdForFlush.current;
    prevSelectedIdForFlush.current = selectedId;
    if (prev && prev !== selectedId) {
      void flushNow();
    }
  }, [selectedId, flushNow]);

  useEffect(() => {
    if (!selectedId) {
      loadGenerationRef.current += 1;
      setActive(null);
      return;
    }
    if (activeRef.current?.id === selectedId) return;

    let cancelled = false;
    const requestGeneration = ++loadGenerationRef.current;
    const guard = captureNoteLoadGuard(selectedId, requestGeneration, draftRef.current);
    setActiveError(null);

    void getNote(selectedId)
      .then((n) => {
        if (cancelled) return;
        if (
          !canApplyNoteLoad(guard, {
            selectedId: selectedIdRef.current,
            requestGeneration: loadGenerationRef.current,
            draft: draftRef.current,
            saved: lastSavedRef.current,
          })
        ) {
          return;
        }
        setActive(n);
        if (!isNoteVaultLocked(n)) acceptLoadedNote(n);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (
          !canApplyNoteLoad(guard, {
            selectedId: selectedIdRef.current,
            requestGeneration: loadGenerationRef.current,
            draft: draftRef.current,
            saved: lastSavedRef.current,
          })
        ) {
          return;
        }
        setActiveError(errorMessage(err, t));
        setActive(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    acceptLoadedNote,
    activeRef,
    selectedId,
    selectedIdRef,
    setActive,
    setActiveError,
    t,
  ]);

  useEffect(() => {
    if (!active || isNoteVaultLocked(active)) return;
    if (active.id !== selectedId) return;
    if (!isNoteDraftDirty(draftRef.current, lastSavedRef.current)) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushNow(), AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [draftTitle, draftBody, active, selectedId, flushNow]);

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
    onRegisterFlush(flushNow);
    return () => onRegisterFlush(null);
  }, [flushNow, onRegisterFlush]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const currentWindow = getCurrentWindow();
    let active = true;
    const dispose = trackAsyncDisposer(
      currentWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        if (await flushNow()) {
          await currentWindow.destroy();
        }
      }),
      (err) => {
        if (active) setActiveError(errorMessage(err, t));
        else console.warn('[nordly:notes] close listener cleanup failed', err);
      },
    );
    return () => {
      active = false;
      dispose();
    };
  }, [flushNow, setActiveError, t]);

  useEffect(
    () => () => {
      if (saveStatusTimer.current !== null) {
        window.clearTimeout(saveStatusTimer.current);
      }
    },
    [],
  );

  return {
    draftTitle,
    draftBody,
    setDraftTitle,
    setDraftBody,
    saveStatus,
    flushNow,
    acceptLoadedNote,
    draftRef,
    lastSavedRef,
    saveTimer,
  };
}
