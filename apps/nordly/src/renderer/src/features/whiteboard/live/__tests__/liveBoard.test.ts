import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { writeSceneToYjs } from '@nordly-collab/excalidrawYjsDoc';
import { applyWsEnvelope, parseEditorWsEnvelope, shouldRetryEditorWsClose } from '@nordly-collab/wsProtocol';

describe('writeSceneToYjs', () => {
  it('does not wipe a room when an empty local change arrives first', () => {
    const ydoc = new Y.Doc();
    writeSceneToYjs(
      ydoc,
      [{ id: 'a', type: 'rectangle' }],
      {},
      'remote',
    );
    writeSceneToYjs(ydoc, [], {}, 'local');
    expect(ydoc.getMap('elements').size).toBe(1);
  });

  it('keeps a newer element when an older version arrives later', () => {
    const ydoc = new Y.Doc();
    writeSceneToYjs(ydoc, [{ id: 'a', version: 4, width: 80 }], {}, 'local');
    writeSceneToYjs(ydoc, [{ id: 'a', version: 1, width: 1 }], {}, 'local');
    expect(JSON.parse(String(ydoc.getMap('elements').get('a')))).toMatchObject({
      version: 4,
      width: 80,
    });
  });

  it('does not delete an element this writer has not published', () => {
    const ydoc = new Y.Doc();
    writeSceneToYjs(
      ydoc,
      [
        { id: 'a', version: 2 },
        { id: 'b', version: 1 },
      ],
      {},
      'local',
    );
    writeSceneToYjs(ydoc, [{ id: 'b', version: 2 }], {}, 'local', { deleteIds: new Set() });
    expect(ydoc.getMap('elements').has('a')).toBe(true);
    expect(ydoc.getMap('elements').has('b')).toBe(true);
  });
});

describe('editor websocket envelopes', () => {
  it('rejects an unknown kind and retries only transient closes', () => {
    expect(() => parseEditorWsEnvelope({ kind: 'nope' })).toThrow(/Unknown collab envelope kind/);
    expect(shouldRetryEditorWsClose(1000)).toBe(false);
    expect(shouldRetryEditorWsClose(1008)).toBe(false);
    expect(shouldRetryEditorWsClose(1006)).toBe(true);
  });

  it('treats participant_joined as a side effect, not a failed socket', () => {
    const env = parseEditorWsEnvelope({ kind: 'participant_joined', data: { user_id: 'abc' } });
    const doc = new Y.Doc();
    expect(() => applyWsEnvelope(env, doc, null)).not.toThrow();
  });
});
