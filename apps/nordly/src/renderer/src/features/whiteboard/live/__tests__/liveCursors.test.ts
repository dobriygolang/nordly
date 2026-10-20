import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';

import { collaboratorsFromAwareness, setLocalCursor } from '@nordly-collab/liveCursors';

describe('collaboratorsFromAwareness', () => {
  it('skips the local client and peers without a name or color', () => {
    const ydoc = new Y.Doc();
    const local = new Awareness(ydoc);

    const remoteDoc = new Y.Doc();
    const remote = new Awareness(remoteDoc);
    remote.setLocalStateField('user', { name: 'Ada', color: '#22aa88', userId: 'ada' });
    setLocalCursor(remote, { x: 10, y: 20, tool: 'laser', button: 'down' });
    applyAwarenessUpdate(local, encodeAwarenessUpdate(remote, [remote.clientID]), 'remote');

    const namelessDoc = new Y.Doc();
    const nameless = new Awareness(namelessDoc);
    nameless.setLocalStateField('user', { color: '#000000' });
    applyAwarenessUpdate(local, encodeAwarenessUpdate(nameless, [nameless.clientID]), 'remote');

    local.setLocalStateField('user', { name: 'me', color: '#111111', userId: 'me' });
    setLocalCursor(local, { x: 1, y: 2, tool: 'pointer', button: 'up' });

    const seen = collaboratorsFromAwareness(local);
    expect(seen.map((peer) => peer.username)).toEqual(['Ada']);
    expect(seen[0]).toMatchObject({
      pointer: { x: 10, y: 20, tool: 'laser', button: 'down' },
      color: '#22aa88',
    });
    expect(seen.some((peer) => peer.clientId === local.clientID)).toBe(false);

    nameless.destroy();
    namelessDoc.destroy();
    remote.destroy();
    remoteDoc.destroy();
    local.destroy();
    ydoc.destroy();
  });
});
