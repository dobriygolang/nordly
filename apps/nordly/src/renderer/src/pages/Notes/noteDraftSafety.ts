export interface NoteDraftSnapshot {
  activeId: string;
  title: string;
  body: string;
  revision: number;
}

export interface NoteSavedSnapshot {
  activeId: string;
  title: string;
  body: string;
}

export interface NoteLoadGuard {
  noteId: string;
  requestGeneration: number;
  draftRevision: number;
}

export function isNoteDraftDirty(
  draft: NoteDraftSnapshot,
  saved: NoteSavedSnapshot,
): boolean {
  if (!draft.activeId) return false;
  return (
    draft.activeId !== saved.activeId ||
    draft.title !== saved.title ||
    draft.body !== saved.body
  );
}

export function captureNoteLoadGuard(
  noteId: string,
  requestGeneration: number,
  draft: NoteDraftSnapshot,
): NoteLoadGuard {
  return {
    noteId,
    requestGeneration,
    draftRevision: draft.revision,
  };
}

/** Reject stale async reads, including reads that completed after an edit-and-save cycle. */
export function canApplyNoteLoad(
  guard: NoteLoadGuard,
  current: {
    selectedId: string | null;
    requestGeneration: number;
    draft: NoteDraftSnapshot;
    saved: NoteSavedSnapshot;
  },
): boolean {
  return (
    current.selectedId === guard.noteId &&
    current.requestGeneration === guard.requestGeneration &&
    current.draft.revision === guard.draftRevision &&
    !isNoteDraftDirty(current.draft, current.saved)
  );
}
