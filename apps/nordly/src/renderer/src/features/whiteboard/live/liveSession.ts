import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { CollabSocket } from '@nordly-collab/collabSocket';
import { observeSceneChanges, sceneToJSON, writeSceneToYjs } from '@nordly-collab/excalidrawYjsDoc';
import {
  collabUserColors,
  collaboratorsFromAwareness,
  setLocalCursor,
  type LiveCollaborator,
  type LivePointer,
} from '@nordly-collab/liveCursors';
import {
  applyWsEnvelope,
  bytesToB64,
  handleCollabSideEffect,
  type EditorWsEnvelope,
} from '@nordly-collab/wsProtocol';
import { API_BASE_URL } from '@shared/api/config';
import { useSessionStore } from '@shared/model/session';

const ALLOWED_FILE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
const MAX_ELEMENTS = 5_000;
const MAX_FILE_DATA_URL = 7_000_000;

export type LiveEndReason = 'stopped' | 'room_closed' | 'token_expired' | 'error';

export type LiveBoardStatus =
  | { kind: 'connecting' }
  | { kind: 'live'; participants: number }
  | { kind: 'ended'; reason: LiveEndReason; message?: string };

export type LiveBoardSession = {
  writeLocal: (elements: readonly unknown[], files: Record<string, unknown>) => void;
  reportPointer: (pointer: LivePointer | null) => void;
  readSceneJson: () => string;
  stop: () => string;
};

type StartLiveBoardArgs = {
  roomId: string;
  accessToken: string;
  expiresIn: number;
  initialSceneJson: string;
  onRemoteScene: (elements: unknown[], files: Record<string, unknown>) => void;
  onCollaborators: (peers: LiveCollaborator[]) => void;
  onStatus: (status: LiveBoardStatus) => void;
};

export function editorWsUrl(roomId: string): string {
  const path = `/ws/editor/${encodeURIComponent(roomId)}`;
  if (!API_BASE_URL) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}${path}`;
  }
  const wsBase = API_BASE_URL.replace(/^http/i, 'ws');
  return `${wsBase}${path}`;
}

export function startLiveBoard(args: StartLiveBoardArgs): LiveBoardSession {
  if (!args.roomId || !args.accessToken) throw new Error('live board: room and token are required');
  if (!Number.isFinite(args.expiresIn) || args.expiresIn <= 0) {
    throw new Error('live board: token expiry is missing');
  }

  const ydoc = new Y.Doc();
  const awareness = new Awareness(ydoc);
  const userId = useSessionStore.getState().userId;
  if (!userId) throw new Error('live board: userId is not set');
  const colors = collabUserColors(userId);
  awareness.setLocalStateField('user', {
    name: userId.slice(0, 8),
    color: colors.color,
    colorLight: colors.colorLight,
    userId,
    active: true,
  });
  let canPublish = false;
  let ended = false;
  const participants = () => awareness.getStates().size;

  let expireTimer = 0;
  let publishTimer = 0;
  let stopObserving = () => {};

  const finish = (reason: LiveEndReason, message?: string) => {
    if (ended) return;
    ended = true;
    window.clearTimeout(expireTimer);
    window.clearTimeout(publishTimer);
    stopObserving();
    socket.stop();
    args.onStatus({ kind: 'ended', reason, message });
  };

  const publishCount = () => {
    if (ended) return;
    args.onStatus({ kind: 'live', participants: participants() });
    args.onCollaborators(collaboratorsFromAwareness(awareness));
  };

  const socket = new CollabSocket({
    url: editorWsUrl(args.roomId),
    token: args.accessToken,
    onStatus: (status, close) => {
      if (ended) return;
      if (status === 'open') {
        publishCount();
        const full = Y.encodeStateAsUpdate(ydoc);
        if (full.byteLength > 0) {
          socket.send({ kind: 'snapshot', data: { payload: bytesToB64(full) } });
        }
        socket.send({
          kind: 'presence',
          data: { update: bytesToB64(encodeAwarenessUpdate(awareness, [awareness.clientID])) },
        });
      } else if (status === 'connecting' || status === 'reconnecting') args.onStatus({ kind: 'connecting' });
      else if (status === 'failed') {
        const code = close?.code;
        finish(
          'error',
          code === undefined ? 'live board connection failed' : `live board connection failed (close ${code})`,
        );
      }
    },
    onProtocolError: (err) => {
      finish('error', err instanceof Error ? err.message : String(err));
    },
    onEnvelope: (env) => {
      try {
        handleCollabSideEffect(env, { onRoomClosed: () => finish('room_closed') });
        if (env.kind === 'snapshot') canPublish = true;
        applyWsEnvelope(env, ydoc, awareness);
        if (env.kind === 'presence' || env.kind === 'participant_joined' || env.kind === 'participant_left') {
          publishCount();
        }
      } catch (err) {
        finish('error', err instanceof Error ? err.message : String(err));
      }
    },
  });

  stopObserving = observeSceneChanges(ydoc, (scene) => {
    try {
      assertRemoteScene(scene.elements, scene.files);
      args.onRemoteScene(scene.elements, scene.files);
    } catch (err) {
      finish('error', err instanceof Error ? err.message : String(err));
    }
  });

  seedInitialScene(ydoc, args.initialSceneJson);
  publishTimer = window.setTimeout(() => {
    canPublish = true;
  }, 300);
  expireTimer = window.setTimeout(() => finish('token_expired'), args.expiresIn * 1000);

  const onYUpdate = (update: Uint8Array, origin: unknown) => {
    if (!canPublish || origin === 'remote' || origin === 'seed') return;
    socket.send({ kind: 'op', data: { payload: bytesToB64(update) } } satisfies EditorWsEnvelope);
  };
  ydoc.on('update', onYUpdate);
  const onAwarenessUpdate = (
    diff: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === 'remote') return;
    const changed = diff.added.concat(diff.updated, diff.removed);
    if (changed.length === 0) return;
    socket.send({
      kind: 'presence',
      data: { update: bytesToB64(encodeAwarenessUpdate(awareness, changed)) },
    });
  };
  awareness.on('update', onAwarenessUpdate);
  awareness.on('change', publishCount);
  socket.start();
  args.onStatus({ kind: 'connecting' });

  let pointerFrame = 0;
  let pendingPointer: LivePointer | null | undefined;

  return {
    writeLocal(elements, files) {
      if (ended) return;
      writeSceneToYjs(ydoc, elements, files, 'local');
    },
    reportPointer(pointer) {
      if (ended) return;
      pendingPointer = pointer;
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (ended) return;
        setLocalCursor(awareness, pendingPointer ?? null);
        pendingPointer = undefined;
      });
    },
    readSceneJson() {
      return sceneToJSON(ydoc);
    },
    stop() {
      const json = sceneToJSON(ydoc);
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      ydoc.off('update', onYUpdate);
      awareness.off('update', onAwarenessUpdate);
      awareness.off('change', publishCount);
      finish('stopped');
      awareness.destroy();
      ydoc.destroy();
      return json;
    },
  };
}
function seedInitialScene(ydoc: Y.Doc, sceneJson: string): void {
  const parsed = JSON.parse(sceneJson) as { elements?: unknown; files?: unknown };
  const elements = Array.isArray(parsed.elements) ? parsed.elements : [];
  const files =
    parsed.files && typeof parsed.files === 'object' && !Array.isArray(parsed.files)
      ? (parsed.files as Record<string, unknown>)
      : {};
  if (elements.length === 0) return;
  writeSceneToYjs(ydoc, elements, files, 'seed');
}

function assertRemoteScene(elements: unknown[], files: Record<string, unknown>): void {
  if (elements.length > MAX_ELEMENTS) throw new Error('live board has too many elements');
  for (const file of Object.values(files)) {
    if (!file || typeof file !== 'object') throw new Error('live board file is invalid');
    const row = file as { mimeType?: unknown; dataURL?: unknown };
    const mime = row.mimeType;
    if (typeof mime !== 'string' || !ALLOWED_FILE_TYPES.has(mime)) {
      throw new Error(`live board file type is not allowed: ${String(mime)}`);
    }
    if (typeof row.dataURL !== 'string' || !row.dataURL.startsWith(`data:${mime}`) || row.dataURL.length > MAX_FILE_DATA_URL) {
      throw new Error('live board file is invalid');
    }
  }
}
