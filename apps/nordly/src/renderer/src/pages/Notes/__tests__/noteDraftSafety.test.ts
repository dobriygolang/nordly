import { describe, expect, it } from 'vitest';

import {
  canApplyNoteLoad,
  captureNoteLoadGuard,
  isNoteDraftDirty,
  type NoteDraftSnapshot,
  type NoteSavedSnapshot,
} from '../noteDraftSafety';

const draft = (
  patch: Partial<NoteDraftSnapshot> = {},
): NoteDraftSnapshot => ({
  activeId: 'note.md',
  title: 'Note',
  body: 'body',
  revision: 4,
  ...patch,
});

const saved = (
  patch: Partial<NoteSavedSnapshot> = {},
): NoteSavedSnapshot => ({
  activeId: 'note.md',
  title: 'Note',
  body: 'body',
  ...patch,
});

describe('note draft safety guards', () => {
  it('tracks dirtiness against the matching note baseline', () => {
    expect(isNoteDraftDirty(draft(), saved())).toBe(false);
    expect(isNoteDraftDirty(draft({ body: 'new body' }), saved())).toBe(true);
    expect(isNoteDraftDirty(draft(), saved({ activeId: 'other.md' }))).toBe(true);
  });

  it('accepts only the latest clean async load', () => {
    const initial = draft();
    const guard = captureNoteLoadGuard('note.md', 3, initial);

    expect(
      canApplyNoteLoad(guard, {
        selectedId: 'note.md',
        requestGeneration: 3,
        draft: initial,
        saved: saved(),
      }),
    ).toBe(true);
    expect(
      canApplyNoteLoad(guard, {
        selectedId: 'other.md',
        requestGeneration: 3,
        draft: initial,
        saved: saved(),
      }),
    ).toBe(false);
    expect(
      canApplyNoteLoad(guard, {
        selectedId: 'note.md',
        requestGeneration: 4,
        draft: initial,
        saved: saved(),
      }),
    ).toBe(false);
  });

  it('rejects a stale read after edits even when the text returns to the same fingerprint', () => {
    const initial = draft();
    const guard = captureNoteLoadGuard('note.md', 3, initial);

    expect(
      canApplyNoteLoad(guard, {
        selectedId: 'note.md',
        requestGeneration: 3,
        draft: draft({ revision: initial.revision + 2 }),
        saved: saved(),
      }),
    ).toBe(false);
  });
});
