import { requireUserId } from '@shared/db/nordlyDb';
import { isApiHttpError } from '@shared/api/errors';
import type { TaskCard } from '@features/tasks/model/task';
import {
  isConferenceProvider,
  isTaskStatus,
  type TaskStatus,
} from '@features/tasks/model/status';
import { isOfflineEpicId, pullEpicsCache } from '@features/tasks/api/epics';
import { findEpicByColor } from '@features/tasks/lib/epicColor';
import {
  remoteCreateTask,
  remoteDeleteTask,
  remoteListTasks,
  remoteMoveTaskStatus,
  remoteScheduleTask,
  remotePatchTask,
} from '@features/tasks/remote/tasksRemote';
import {
  tasksStoreGet,
  tasksStoreMergeRemote,
  tasksStoreReplaceId,
  tasksStoreApplyRemoteAbsences,
  reconcileTasksStore,
} from '@features/tasks/repository/tasksStore';
import { SyncDeferredError } from '@shared/sync/errors';
import { getServerId, setServerId } from '@shared/sync/idMap';
import { listOutbox, removeOutbox } from '@shared/sync/outbox';
import { OutboxOp, SyncDomain, type OutboxEntry } from '@shared/sync/types';

function isRemoteNotFound(err: unknown): boolean {
  return isApiHttpError(err, 404);
}

function titleFromPayload(payload: Record<string, unknown>): string | null {
  if (!('title' in payload)) return null;
  if (typeof payload.title !== 'string') {
    throw new Error('Invalid tasks outbox payload: title must be a string');
  }
  const title = payload.title.trim();
  return title || null;
}

function requireTaskStatus(payload: Record<string, unknown>, entryId: string): TaskStatus {
  const status = payload.status;
  if (typeof status !== 'string' || !isTaskStatus(status)) {
    throw new Error(`Invalid tasks status outbox (${entryId}): ${String(status)}`);
  }
  return status;
}

async function resolveTaskTitle(
  entityId: string,
  userId: string,
  local: TaskCard | null,
  queue?: OutboxEntry[],
): Promise<string | null> {
  const fromLocal = local?.title?.trim();
  if (fromLocal) return fromLocal;

  const rows = queue ?? (await listOutbox(userId));
  const createEntry = rows.find(
    (e) =>
      e.domain === SyncDomain.Tasks &&
      e.entityId === entityId &&
      e.op === OutboxOp.Create,
  );
  if (createEntry) {
    const fromCreate = titleFromPayload(createEntry.payload as Record<string, unknown>);
    if (fromCreate) return fromCreate;
  }
  return null;
}

async function dropTasksOutboxForEntity(
  entityId: string,
  userId: string,
  reason: string,
): Promise<number> {
  const rows = await listOutbox(userId);
  const doomed = rows.filter(
    (e) => e.domain === SyncDomain.Tasks && e.entityId === entityId,
  );
  for (const e of doomed) await removeOutbox(e.id, userId);
  if (doomed.length > 0) {
    console.warn(
      `[nordly:sync] Dropped ${doomed.length} tasks outbox entries for ${entityId}: ${reason}`,
    );
  }
  return doomed.length;
}

async function resolveTaskServerId(entry: OutboxEntry, userId: string): Promise<string | null> {
  const mapped = await getServerId(SyncDomain.Tasks, entry.entityId, userId);
  if (mapped) return mapped;

  const local = await tasksStoreGet(entry.entityId, userId);
  if (!local) {
    await removeOutbox(entry.id, userId);
    return null;
  }

  const title = await resolveTaskTitle(entry.entityId, userId, local);
  if (!title) {
    await dropTasksOutboxForEntity(entry.entityId, userId, 'empty title');
    return null;
  }

  const created = await remoteCreateTask({ title, kind: local.kind });
  await setServerId(SyncDomain.Tasks, entry.entityId, created.id, userId);
  await tasksStoreReplaceId(entry.entityId, created);
  return created.id;
}

async function runTaskRemote<T>(
  entry: OutboxEntry,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isRemoteNotFound(err)) {
      if (entry.op === OutboxOp.Delete) {
        return null;
      }
      throw new Error(`tasks ${entry.op}: remote task missing for ${entry.entityId}`);
    }
    throw err;
  }
}

export async function pushTasksOutbox(entry: OutboxEntry): Promise<void> {
  const userId = requireUserId();
  const payload = entry.payload as Record<string, unknown>;

  if (entry.op === OutboxOp.Create) {
    const alreadyMapped = await getServerId(
      SyncDomain.Tasks,
      entry.entityId,
      userId,
    );
    if (alreadyMapped) {
      await removeOutbox(entry.id, userId);
      return;
    }
    const local = await tasksStoreGet(entry.entityId, userId);
    if (!local) {
      // Tombstoned or missing — do not recreate on the server; leave delete outbox if any.
      await removeOutbox(entry.id, userId);
      return;
    }
    const title = await resolveTaskTitle(entry.entityId, userId, local);
    if (!title) {
      throw new Error(
        `Invalid tasks create outbox (${entry.id}): empty title for ${entry.entityId}`,
      );
    }
    const created = await remoteCreateTask({
      title,
      kind: local.kind,
    });
    await setServerId(SyncDomain.Tasks, entry.entityId, created.id, userId);
    await tasksStoreReplaceId(entry.entityId, created);
    await removeOutbox(entry.id, userId);
    return;
  }

  const serverId = await resolveTaskServerId(entry, userId);
  if (!serverId) return;

  if (entry.op === OutboxOp.Status) {
    const status = requireTaskStatus(payload, entry.id);
    const updated = await runTaskRemote(entry, () =>
      remoteMoveTaskStatus(serverId, status),
    );
    if (!updated) return;
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === OutboxOp.Schedule) {
    if (typeof payload.startIso !== 'string' || payload.startIso.length === 0) {
      throw new Error(
        `Invalid tasks schedule outbox (${entry.id}): missing startIso`,
      );
    }
    if (typeof payload.durationMin !== 'number' || !Number.isFinite(payload.durationMin)) {
      throw new Error(
        `Invalid tasks schedule outbox (${entry.id}): missing durationMin`,
      );
    }
    const startIso = payload.startIso;
    const durationMin = payload.durationMin;
    const updated = await runTaskRemote(entry, () =>
      remoteScheduleTask(serverId, startIso, durationMin),
    );
    if (!updated) return;
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === OutboxOp.Delete) {
    await runTaskRemote(entry, () => remoteDeleteTask(serverId));
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === OutboxOp.Patch) {
    const patch: Parameters<typeof remotePatchTask>[1] = {};
    if (payload.clearEpic === true) patch.clearEpic = true;
    if (payload.clearConference === true) patch.clearConference = true;
    if (typeof payload.conferenceUrl === 'string' && payload.conferenceUrl.trim()) {
      patch.conferenceUrl = payload.conferenceUrl.trim();
    }
    if (payload.conferenceProvider !== undefined) {
      if (
        typeof payload.conferenceProvider !== 'string' ||
        !isConferenceProvider(payload.conferenceProvider)
      ) {
        throw new Error(
          `Invalid tasks patch outbox (${entry.id}): invalid conferenceProvider`,
        );
      }
      patch.conferenceProvider = payload.conferenceProvider;
    }
    if (payload.googleEventId !== undefined || payload.googleCalendarId !== undefined) {
      if (payload.googleEventId === null || payload.googleCalendarId === null) {
        throw new Error(
          `Invalid tasks patch outbox (${entry.id}): clear Google conference via clearConference`,
        );
      }
      if (
        typeof payload.googleEventId !== 'string' ||
        !payload.googleEventId.trim() ||
        typeof payload.googleCalendarId !== 'string' ||
        !payload.googleCalendarId.trim()
      ) {
        throw new Error(
          `Invalid tasks patch outbox (${entry.id}): googleEventId and googleCalendarId must be set together`,
        );
      }
      patch.googleEventId = payload.googleEventId;
      patch.googleCalendarId = payload.googleCalendarId;
    }
    if (payload.zoomMeetingId === null) patch.zoomMeetingId = null;
    else if (typeof payload.zoomMeetingId === 'string') patch.zoomMeetingId = payload.zoomMeetingId;
    if (payload.epicId !== undefined) {
      if (typeof payload.epicId !== 'string' || !payload.epicId.trim()) {
        throw new Error(`Invalid tasks patch outbox (${entry.id}): epicId must be a non-empty string`);
      }
      patch.epicId = payload.epicId.trim();
    } else if (payload.epicColor !== undefined) {
      if (typeof payload.epicColor !== 'string' || !payload.epicColor.trim()) {
        throw new Error(
          `Invalid tasks patch outbox (${entry.id}): epicColor must be a non-empty string`,
        );
      }
      const epics = await pullEpicsCache();
      const match = findEpicByColor(epics, payload.epicColor.trim());
      if (!match || isOfflineEpicId(match.id)) {
        throw new SyncDeferredError(`Cannot resolve epic color in outbox entry ${entry.id}`);
      }
      patch.epicId = match.id;
    }
    if (Object.keys(patch).length === 0) {
      throw new Error(`Invalid tasks patch outbox (${entry.id}): empty patch`);
    }
    const updated = await runTaskRemote(entry, () => remotePatchTask(serverId, patch));
    if (!updated) return;
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
    return;
  }

  throw new Error(`Unsupported tasks outbox operation: ${entry.op}`);
}

/** Remove queued mutations only when their local task was intentionally deleted. */
export async function reconcileTasksOutbox(): Promise<number> {
  const userId = requireUserId();
  const queue = await listOutbox(userId);
  let dropped = 0;

  for (const entry of queue.filter((e) => e.domain === SyncDomain.Tasks)) {
    const local = await tasksStoreGet(entry.entityId, userId);
    if (
      entry.op === OutboxOp.Create ||
      !(await getServerId(SyncDomain.Tasks, entry.entityId, userId))
    ) {
      const title = await resolveTaskTitle(entry.entityId, userId, local, queue);
      if (!title) {
        if (local) {
          throw new Error(
            `Invalid tasks outbox (${entry.id}): empty title for ${entry.entityId}`,
          );
        }
        await removeOutbox(entry.id, userId);
        dropped++;
      }
    }
  }

  if (dropped > 0) {
    console.info(`[nordly:sync] Reconcile removed ${dropped} tombstoned tasks outbox entries`);
  }
  return dropped;
}

export async function pullTasks(): Promise<void> {
  await pullEpicsCache();
  const remote = await remoteListTasks();
  const remoteIds = new Set(remote.map((t) => t.id));
  for (const task of remote) {
    await tasksStoreMergeRemote(task);
  }
  await tasksStoreApplyRemoteAbsences(remoteIds);
  await reconcileTasksStore();
}
