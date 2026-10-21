import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import {
  collectDraftElements,
  draftsFromAwareness,
  draftSignature,
  indexElementsById,
  isBoardGesturing,
  mergeCommittedWithRemoteDrafts,
  preserveLocalDrafts,
  setLocalDraft,
} from '@nordly-collab/liveDraft';

describe('isBoardGesturing', () => {
  it('detects pointer-down and Excalidraw edit flags', () => {
    expect(isBoardGesturing({}, 'down')).toBe(true);
    expect(isBoardGesturing({ newElement: { id: 'a' } }, 'up')).toBe(true);
    expect(isBoardGesturing({ editingElement: { id: 'a' } }, 'up')).toBe(true);
    expect(isBoardGesturing({ isResizing: true }, 'up')).toBe(true);
    expect(isBoardGesturing({ selectedLinearElement: { isEditing: true } }, 'up')).toBe(true);
    expect(isBoardGesturing({}, 'up')).toBe(false);
  });
});

describe('collectDraftElements + merge', () => {
  it('collects only elements that differ from the committed index', () => {
    const committed = indexElementsById([
      { id: 'a', version: 1 },
      { id: 'b', version: 1 },
    ]);
    const draft = collectDraftElements(
      [
        { id: 'a', version: 1 },
        { id: 'b', version: 2 },
        { id: 'c', version: 1 },
      ],
      committed,
    );
    expect(draft).toEqual([
      { id: 'b', version: 2 },
      { id: 'c', version: 1 },
    ]);
  });

  it('lets remote drafts override and append committed elements', () => {
    const merged = mergeCommittedWithRemoteDrafts(
      [
        { id: 'a', v: 1 },
        { id: 'b', v: 1 },
      ],
      [{ clientId: 2, elements: [{ id: 'b', v: 9 }, { id: 'c', v: 1 }] }],
    );
    expect(merged).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 9 },
      { id: 'c', v: 1 },
    ]);
  });

  it('preserves local draft ids over a remote merge', () => {
    const out = preserveLocalDrafts(
      [
        { id: 'a', v: 1 },
        { id: 'b', v: 99 },
      ],
      [{ id: 'b', v: 'local' }],
      new Set(['b']),
    );
    expect(out).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 'local' },
    ]);
  });
});

describe('draftsFromAwareness', () => {
  it('skips the local client and empty drafts', () => {
    const ydoc = new Y.Doc();
    const local = new Awareness(ydoc);

    const remoteDoc = new Y.Doc();
    const remote = new Awareness(remoteDoc);
    remote.setLocalStateField('user', { name: 'Ada', color: '#22aa88' });
    setLocalDraft(remote, [{ id: 'stroke', points: [[0, 0]] }]);
    applyAwarenessUpdate(local, encodeAwarenessUpdate(remote, [remote.clientID]), 'remote');

    setLocalDraft(local, [{ id: 'mine', points: [] }]);

    const seen = draftsFromAwareness(local);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.elements).toEqual([{ id: 'stroke', points: [[0, 0]] }]);
    expect(draftSignature(seen).length).toBeGreaterThan(0);

    remote.destroy();
    remoteDoc.destroy();
    local.destroy();
    ydoc.destroy();
  });
});
