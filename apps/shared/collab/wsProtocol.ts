import * as Y from 'yjs';
import { applyAwarenessUpdate } from 'y-protocols/awareness';
import type { Awareness } from 'y-protocols/awareness';

export const EDITOR_WS_KINDS = [
  'snapshot',
  'op',
  'presence',
  'cursor',
  'code_run',
  'room_closed',
  'participant_joined',
  'participant_left',
] as const;
export type EditorWsKind = (typeof EDITOR_WS_KINDS)[number];

export type EditorWsEnvelope = {
  kind: EditorWsKind;
  data?: unknown;
};

export const EDITOR_WS_STATUSES = [
  'connecting',
  'open',
  'reconnecting',
  'failed',
  'closed',
] as const;
export type EditorWsStatus = (typeof EDITOR_WS_STATUSES)[number];

/** Policy and room-closed frames must not be retried; 410 upgrades arrive as 1006. */
export function shouldRetryEditorWsClose(code: number): boolean {
  return code !== 1000 && code !== 1008;
}

export function parseEditorWsEnvelope(raw: unknown): EditorWsEnvelope {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid WS envelope');
  }
  const kind = (raw as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !(EDITOR_WS_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Unknown collab envelope kind: ${String(kind)}`);
  }
  return { kind: kind as EditorWsKind, data: (raw as { data?: unknown }).data };
}

const MAX_YJS_BYTES = 8_000_000;

export function decodeYjsPayload(payload: unknown): Uint8Array | null {
  if (payload == null) return null;
  if (typeof payload === 'string') return b64ToBytes(payload);
  if (payload instanceof Uint8Array) return payload;
  if (Array.isArray(payload)) return bytesFromNumbers(payload);
  throw new Error(`Invalid Yjs payload type: ${typeof payload}`);
}

function bytesFromNumbers(payload: unknown[]): Uint8Array {
  if (payload.length > MAX_YJS_BYTES) throw new Error('collab update is too large');
  const bytes = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i += 1) {
    const value = payload[i];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error('Invalid Yjs payload');
    }
    bytes[i] = value;
  }
  return bytes;
}

export function bytesToB64(bytes: Uint8Array): string {
  const CHUNK = 0x2000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function b64ToBytes(b64: string): Uint8Array {
  if (b64.length > Math.ceil(MAX_YJS_BYTES / 3) * 4) {
    throw new Error('collab update is too large');
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

const ENVELOPE_KIND_ORDER: Partial<Record<EditorWsKind, number>> = {
  snapshot: 0,
  op: 1,
  presence: 2,
};

function envelopeKindOrder(kind: EditorWsKind): number {
  const order = ENVELOPE_KIND_ORDER[kind];
  if (order === undefined) {
    throw new Error(`Unknown collab envelope kind: ${kind}`);
  }
  return order;
}

/** Canonical presence payload is `{ update: "<b64>" }`. */
export function extractPresenceUpdate(data: unknown): string {
  if (data == null || typeof data !== 'object') {
    throw new Error('Invalid presence payload');
  }
  const update = (data as Record<string, unknown>).update;
  if (typeof update !== 'string' || !update) {
    throw new Error('Invalid presence payload: missing update');
  }
  return update;
}

function applyPresenceUpdate(awareness: Awareness, data: unknown): void {
  applyAwarenessUpdate(awareness, b64ToBytes(extractPresenceUpdate(data)), 'remote');
}

const SIDE_EFFECT_KINDS = new Set<EditorWsKind>([
  'room_closed',
  'code_run',
  'cursor',
  'participant_joined',
  'participant_left',
]);

export function applyWsEnvelope(
  env: EditorWsEnvelope,
  ydoc: Y.Doc,
  awareness: Awareness | null,
): void {
  if (SIDE_EFFECT_KINDS.has(env.kind)) return;
  if (env.kind === 'snapshot' || env.kind === 'op') {
    const data = env.data as { payload?: unknown } | undefined;
    const bytes = decodeYjsPayload(data?.payload);
    if (!bytes) {
      throw new Error(`collab ${env.kind} missing payload`);
    }
    if (bytes.byteLength > MAX_YJS_BYTES) {
      throw new Error('collab update is too large');
    }
    if (bytes.byteLength > 0) {
      Y.applyUpdate(ydoc, bytes, 'remote');
    }
    return;
  }
  if (env.kind === 'presence') {
    if (!awareness) return;
    applyPresenceUpdate(awareness, env.data);
    return;
  }
  throw new Error(`Unknown collab envelope kind: ${env.kind}`);
}

export function applyWsEnvelopes(
  envs: EditorWsEnvelope[],
  ydoc: Y.Doc,
  awareness: Awareness | null,
): void {
  const docEnvs = envs.filter(
    (env) => env.kind === 'snapshot' || env.kind === 'op' || env.kind === 'presence',
  );
  const sorted = [...docEnvs].sort(
    (a, b) => envelopeKindOrder(a.kind) - envelopeKindOrder(b.kind),
  );
  for (const env of sorted) {
    if (env.kind === 'snapshot' || env.kind === 'op') {
      applyWsEnvelope(env, ydoc, awareness);
    }
  }
  for (const env of sorted) {
    if (env.kind === 'presence' && awareness) {
      applyPresenceUpdate(awareness, env.data);
    }
  }
}

export type CodeRunBroadcast = {
  run_id: string;
  triggered_by?: string;
};

export type CollabSideEffectHandlers = {
  onRoomClosed?: () => void;
  onCodeRun?: (payload: CodeRunBroadcast) => void;
};

export function handleCollabSideEffect(
  env: EditorWsEnvelope,
  handlers: CollabSideEffectHandlers,
): void {
  if (env.kind === 'room_closed') {
    handlers.onRoomClosed?.();
    return;
  }
  if (env.kind === 'code_run') {
    const data = env.data as CodeRunBroadcast | undefined;
    if (!data?.run_id) {
      throw new Error('collab code_run missing run_id');
    }
    handlers.onCodeRun?.(data);
  }
}
