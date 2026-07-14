import { requireUserId } from '@shared/db/nordlyDb';
import {
  remoteEndFocusSession,
  remoteStartFocusSession,
} from '@features/focus/remote/focusRemote';
import { focusStoreGet, focusStorePut, focusStoreUnsynced } from '@features/focus/repository/focusStore';
import { getServerId, setServerId } from '@shared/sync/idMap';
import { enqueueOutbox, hasOutboxForEntity, removeOutbox } from '@shared/sync/outbox';
import { SyncDeferredError } from '@shared/sync/errors';
import { isSyncEnabled } from '@shared/sync/syncConfig';
import type { OutboxEntry } from '@shared/sync/types';

export async function pushFocusOutbox(entry: OutboxEntry): Promise<void> {
  const userId = requireUserId();
  const payload = entry.payload as Record<string, unknown>;

  if (entry.op === 'session_start') {
    const session = await remoteStartFocusSession({
      planItemId: String(payload.planItemId ?? ''),
      pinnedTitle: String(payload.pinnedTitle ?? ''),
      mode: (payload.mode as 'pomodoro' | 'stopwatch') ?? 'pomodoro',
    });
    await setServerId('focus', entry.entityId, session.id, userId);
    const local = await focusStoreGet(entry.entityId, userId);
    if (local) {
      await focusStorePut({ ...local, synced: false });
    }
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === 'session_end') {
    const serverId = await getServerId('focus', entry.entityId, userId);
    if (!serverId) {
      throw new SyncDeferredError(`Focus session ${entry.entityId} not started on server yet`);
    }
    await remoteEndFocusSession({
      sessionId: serverId,
      pomodorosCompleted: Number(payload.pomodorosCompleted ?? 0),
      secondsFocused: Number(payload.secondsFocused ?? 0),
    });
    const local = await focusStoreGet(entry.entityId, userId);
    if (local) {
      await focusStorePut({ ...local, synced: true });
    }
    await removeOutbox(entry.id, userId);
  }
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
      await enqueueOutbox('focus', 'session_start', session.id, {
        planItemId: session.planItemId,
        pinnedTitle: session.pinnedTitle,
        mode: session.mode,
      });
      added++;
    }

    if (!hasEnd) {
      await enqueueOutbox('focus', 'session_end', session.id, {
        pomodorosCompleted: session.pomodorosCompleted,
        secondsFocused: session.secondsFocused,
      });
      added++;
    }
  }

  return added;
}
