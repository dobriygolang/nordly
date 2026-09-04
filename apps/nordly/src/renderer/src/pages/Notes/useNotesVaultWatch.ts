import { useCallback, useEffect, useRef, useState } from 'react';

import type { TFunc } from '@nordly-i18n';

import {
  getNote,
  isNoteVaultLocked,
  isNotesVaultBound,
  refreshNotesVaultBoundCache,
  type Note,
} from '@features/notes/api/notesClient';
import {
  cancelDeferredVaultWatchReload,
  deferVaultWatchReload,
  isVaultWatchSuppressed,
  listenVaultChanged,
  revokeVaultImageCache,
  vaultStartWatch,
  vaultStopWatch,
} from '@features/notes/api/vault';
import { subscribeVault } from '@shared/crypto/vault';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { getServerId } from '@shared/sync/idMap';
import { SyncDomain } from '@shared/sync/types';
import { isTauriRuntime } from '@platform/runtime';
import { errorMessage } from './utils';
import {
  canApplyNoteLoad,
  captureNoteLoadGuard,
  isNoteDraftDirty,
  type NoteDraftSnapshot,
  type NoteSavedSnapshot,
} from './noteDraftSafety';

export function useNotesVaultWatch({
  t,
  loadList,
  selectedId,
  selectedIdRef,
  setSelectedId,
  setActive,
  acceptLoadedNote,
  setActiveError,
  draftRef,
  lastSavedRef,
}: {
  t: TFunc;
  loadList: () => void;
  selectedId: string | null;
  selectedIdRef: React.MutableRefObject<string | null>;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  setActive: React.Dispatch<React.SetStateAction<Note | null>>;
  acceptLoadedNote: (note: Note) => void;
  setActiveError: React.Dispatch<React.SetStateAction<string | null>>;
  draftRef: React.MutableRefObject<NoteDraftSnapshot>;
  lastSavedRef: React.MutableRefObject<NoteSavedSnapshot>;
}): {
  vaultReady: boolean | null;
  setVaultReady: React.Dispatch<React.SetStateAction<boolean | null>>;
} {
  const [vaultReady, setVaultReady] = useState<boolean | null>(
    () => (isTauriRuntime() ? null : true),
  );
  const reloadGenerationRef = useRef(0);

  const reloadSelectedNote = useCallback(
    async (id: string): Promise<void> => {
      const requestGeneration = ++reloadGenerationRef.current;
      if (isNoteDraftDirty(draftRef.current, lastSavedRef.current)) return;
      const guard = captureNoteLoadGuard(id, requestGeneration, draftRef.current);
      const canApply = (): boolean =>
        canApplyNoteLoad(guard, {
          selectedId: selectedIdRef.current,
          requestGeneration: reloadGenerationRef.current,
          draft: draftRef.current,
          saved: lastSavedRef.current,
        });

      try {
        const note = await getNote(id);
        if (!canApply()) return;
        setActive(note);
        if (!isNoteVaultLocked(note)) acceptLoadedNote(note);
        setActiveError(null);
      } catch (err: unknown) {
        if (!canApply()) return;
        const raw = err instanceof Error ? err.message : String(err);
        if (/note not found|no such file|os error 2/i.test(raw)) {
          selectedIdRef.current = null;
          setActive(null);
          setSelectedId(null);
          return;
        }
        setActiveError(errorMessage(err, t));
      }
    },
    [
      acceptLoadedNote,
      draftRef,
      lastSavedRef,
      selectedIdRef,
      setActive,
      setActiveError,
      setSelectedId,
      t,
    ],
  );

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
            if (!cancelled) setActiveError(errorMessage(err, t));
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setVaultReady(false);
          setActiveError(errorMessage(err, t));
        }
      });
    return () => {
      cancelled = true;
      void vaultStopWatch().catch((err) => {
        console.warn('[nordly:notes] vault watch stop failed', err);
      });
    };
  }, [setActiveError, t]);

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
      void reloadSelectedNote(id);
    });
    return unsub;
  }, [loadList, reloadSelectedNote, selectedIdRef]);

  useEffect(() => {
    const onSync = () => {
      void (async () => {
        if (await isNotesVaultBound()) {
          loadList();
          const selected = selectedIdRef.current;
          if (selected) await reloadSelectedNote(selected);
          return;
        }
        const prevSelected = selectedIdRef.current;
        let id = prevSelected;
        if (prevSelected) {
          const mapped = await getServerId(SyncDomain.Notes, prevSelected);
          if (selectedIdRef.current !== prevSelected) return;
          if (mapped && mapped !== prevSelected) {
            selectedIdRef.current = mapped;
            setSelectedId(mapped);
            if (draftRef.current.activeId === prevSelected) {
              draftRef.current = {
                ...draftRef.current,
                activeId: mapped,
                revision: draftRef.current.revision + 1,
              };
            }
            if (lastSavedRef.current.activeId === prevSelected) {
              lastSavedRef.current = { ...lastSavedRef.current, activeId: mapped };
            }
            id = mapped;
          }
        }
        loadList();
        if (!id) return;
        await reloadSelectedNote(id);
      })();
    };
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
  }, [
    draftRef,
    lastSavedRef,
    loadList,
    reloadSelectedNote,
    selectedIdRef,
    setSelectedId,
  ]);

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
    const stopListening = listenVaultChanged(
      () => {
        const reload = () => {
          const id = selectedIdRef.current;
          loadList();
          if (id) void reloadSelectedNote(id);
        };
        if (isVaultWatchSuppressed()) {
          deferVaultWatchReload(reload);
          return;
        }
        reload();
      },
      (err) => setActiveError(errorMessage(err, t)),
    );
    return () => {
      stopListening();
      cancelDeferredVaultWatchReload();
    };
  }, [
    loadList,
    reloadSelectedNote,
    selectedIdRef,
    setActiveError,
    t,
    vaultReady,
  ]);

  return { vaultReady, setVaultReady };
}
