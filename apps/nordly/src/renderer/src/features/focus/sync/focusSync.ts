import { requireUserId } from '@shared/db/nordlyDb';
import {
  remoteEndFocusSession,
  remoteStartFocusSession,
} from '@features/focus/remote/focusRemote';
import { focusStoreGet, focusStorePut, focusStoreUnsynced } from '@features/focus/repository/focusStore';
import { getServerId, setServerId } from '@shared/sync/idMap';
import {
  enqueueOutboxOnce,
  hasOutboxForEntity,
  removeOutboxForEntity,
} from '@shared/sync/outbox';
import { SyncDeferredError } from '@shared/sync/errors';
import { isSyncEnabled } from '@shared/sync/syncConfig';
import type { OutboxEntry } from '@shared/sync/types';

export async function pushFocusOutbox(entry: OutboxEntry): Promise<void> {
  const userId = requireUserId();
  const payload = entry.payload as Record<string, unknown>;

  if (entry.op === 'session_start') {
    const existingId = await getServerId('focus', entry.entityId, userId);
    if (existingId) {
      await removeOutboxForEntity('focus', entry.entityId, 'session_start', userId);
      return;
    }
    const mode = payload.mode;
    if (mode !== 'pomodoro' && mode !== 'stopwatch') {
      throw new Error(`Invalid focus start mode (${entry.id})`);
    }
    const session = await remoteStartFocusSession({
      planItemId: requirePayloadString(payload, 'planItemId', entry.id),
      pinnedTitle: requirePayloadString(payload, 'pinnedTitle', entry.id),
      mode,
      clientSessionId: requirePayloadEntityId(payload, 'clientSessionId', entry),
      startedAt: requirePayloadTimestamp(payload, 'startedAt', entry.id),
    });
    await setServerId('focus', entry.entityId, session.id, userId);
    const local = await focusStoreGet(entry.entityId, userId);
    if (local) {
      await focusStorePut({ ...local, synced: false });
    }
    await removeOutboxForEntity('focus', entry.entityId, 'session_start', userId);
    return;
  }

  if (entry.op === 'session_end') {
    const localBefore = await focusStoreGet(entry.entityId, userId);
    if (localBefore?.synced) {
      await removeOutboxForEntity('focus', entry.entityId, 'session_end', userId);
      return;
    }
    const serverId = await getServerId('focus', entry.entityId, userId);
    if (!serverId) {
      throw new SyncDeferredError(`Focus session ${entry.entityId} not started on server yet`);
    }
    await remoteEndFocusSession({
      sessionId: serverId,
      pomodorosCompleted: requirePayloadCount(payload, 'pomodorosCompleted', entry.id),
      secondsFocused: requirePayloadCount(payload, 'secondsFocused', entry.id),
      endedAt: requirePayloadTimestamp(payload, 'endedAt', entry.id),
    });
    const local = await focusStoreGet(entry.entityId, userId);
    if (local) {
      await focusStorePut({ ...local, synced: true });
    }
    await removeOutboxForEntity('focus', entry.entityId, 'session_end', userId);
  }
}

function requirePayloadString(
  payload: Record<string, unknown>,
  key: string,
  entryId: string,
): string {
  const value = payload[key];
  if (typeof value !== 'string') {
    throw new Error(`Invalid focus outbox payload: ${key} (${entryId})`);
  }
  return value;
}

function requirePayloadCount(
  payload: Record<string, unknown>,
  key: string,
  entryId: string,
): number {
  const value = payload[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid focus outbox payload: ${key} (${entryId})`);
  }
  return value;
}

function requirePayloadEntityId(
  payload: Record<string, unknown>,
  key: string,
  entry: OutboxEntry,
): string {
  const value = requirePayloadString(payload, key, entry.id);
  if (value !== entry.entityId) {
    throw new Error(`Invalid focus outbox payload: ${key} (${entry.id})`);
  }
  return value;
}

function requirePayloadTimestamp(
  payload: Record<string, unknown>,
  key: string,
  entryId: string,
): string {
  const value = requirePayloadString(payload, key, entryId);
  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid focus outbox payload: ${key} (${entryId})`);
  }
  return value;
}

export async function pullFocus(): Promise<void> {
  /* Stats pulled on-demand via remoteGetStats in focusClient cache */
}

/** Re-enqueue focus sessions that were dropped from outbox but remain unsynced locally. */
export async function reconcileFocusOutbox(): Promise<number> {
  if (!isSyncEnabled()) return 0;
  const userId = requireUserId();
  const unsynced = await focusStoreUnsynced(userId);
  let added = 0;

  for (const session of unsynced) {
    const serverId = await getServerId('focus', session.id, userId);
    const hasStart = await hasOutboxForEntity('focus', session.id, 'session_start', userId);
    const hasEnd = await hasOutboxForEntity('focus', session.id, 'session_end', userId);

    if (!serverId && !hasStart) {
      const enqueued = await enqueueOutboxOnce('focus', 'session_start', session.id, {
        planItemId: session.planItemId,
        pinnedTitle: session.pinnedTitle,
        mode: session.mode,
        clientSessionId: session.id,
        startedAt: session.startedAt,
      });
      if (enqueued) added++;
    }

    if (!hasEnd) {
      const enqueued = await enqueueOutboxOnce('focus', 'session_end', session.id, {
        pomodorosCompleted: session.pomodorosCompleted,
        secondsFocused: session.secondsFocused,
        endedAt: session.endedAt,
      });
      if (enqueued) added++;
    }
  }

  return added;
}
