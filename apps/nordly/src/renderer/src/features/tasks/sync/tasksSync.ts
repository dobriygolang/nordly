import { requireUserId } from '@shared/db/nordlyDb';
import type { TaskCard, TaskKind, TaskStatus } from '@features/tasks/api/tasks';
import { isOfflineEpicId } from '@features/tasks/api/epics';
import { findEpicByColor } from '@features/tasks/lib/epicColor';
import { pullEpicsCache } from '@features/tasks/lib/useTaskEpics';
import {
  remoteCreateTask,
  remoteDeleteTask,
  remoteListTasks,
  remoteMoveTaskStatus,
  remoteScheduleTask,
  remoteUnscheduleTask,
  remotePatchTask,
} from '@features/tasks/repository/tasksRemote';
import {
  tasksStoreGet,
  tasksStoreMergeRemote,
  tasksStoreReplaceId,
  reconcileTasksStore,
} from '@features/tasks/repository/tasksStore';
import { SyncDeferredError } from '@shared/sync/errors';
import { getServerId, setServerId } from '@shared/sync/idMap';
import { listOutbox, removeOutbox } from '@shared/sync/outbox';
import type { OutboxEntry } from '@shared/sync/types';

function isRemoteNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes(': 404');
}

function titleFromPayload(payload: Record<string, unknown>): string {
  return typeof payload.title === 'string' ? payload.title.trim() : '';
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
    (e) => e.domain === 'tasks' && e.entityId === entityId && e.op === 'create',
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
  const doomed = rows.filter((e) => e.domain === 'tasks' && e.entityId === entityId);
  for (const e of doomed) await removeOutbox(e.id, userId);
  if (doomed.length > 0) {
    console.warn(
      `[nordly:sync] Dropped ${doomed.length} tasks outbox entries for ${entityId}: ${reason}`,
    );
  }
  return doomed.length;
}

async function resolveTaskServerId(entry: OutboxEntry, userId: string): Promise<string | null> {
  const mapped = await getServerId('tasks', entry.entityId, userId);
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
  await setServerId('tasks', entry.entityId, created.id, userId);
  await tasksStoreReplaceId(entry.entityId, created);
  return created.id;
}

async function runTaskRemote<T>(
  entry: OutboxEntry,
  userId: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isRemoteNotFound(err)) {
      await removeOutbox(entry.id, userId);
      return null;
    }
    throw err;
  }
}

export async function pushTasksOutbox(entry: OutboxEntry): Promise<void> {
  const userId = requireUserId();
  const payload = entry.payload as Record<string, unknown>;

  if (entry.op === 'create') {
    const local = await tasksStoreGet(entry.entityId, userId);
    const title = await resolveTaskTitle(entry.entityId, userId, local);
    if (!title) {
      await removeOutbox(entry.id, userId);
      console.warn(
        `[nordly:sync] Dropped tasks create outbox (${entry.id}): empty title for ${entry.entityId}`,
      );
      return;
    }
    const created = await remoteCreateTask({
      title,
      kind: (payload.kind as TaskKind | undefined) ?? local?.kind ?? 'custom',
    });
    await setServerId('tasks', entry.entityId, created.id, userId);
    await tasksStoreReplaceId(entry.entityId, created);
    await removeOutbox(entry.id, userId);
    return;
  }

  const serverId = await resolveTaskServerId(entry, userId);
  if (!serverId) return;

  if (entry.op === 'status') {
    const updated = await runTaskRemote(entry, userId, () =>
      remoteMoveTaskStatus(serverId, payload.status as TaskStatus),
    );
    if (!updated) return;
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === 'schedule') {
    if (typeof payload.startIso !== 'string' || payload.startIso.length === 0) {
      await removeOutbox(entry.id, userId);
      console.warn(
        `[nordly:sync] Dropped tasks schedule outbox (${entry.id}): missing startIso`,
      );
      return;
    }
    if (typeof payload.durationMin !== 'number' || !Number.isFinite(payload.durationMin)) {
      await removeOutbox(entry.id, userId);
      console.warn(
        `[nordly:sync] Dropped tasks schedule outbox (${entry.id}): missing durationMin`,
      );
      return;
    }
    const startIso = payload.startIso;
    const durationMin = payload.durationMin;
    const updated = await runTaskRemote(entry, userId, () =>
      remoteScheduleTask(serverId, startIso, durationMin),
    );
    if (!updated) return;
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === 'unschedule') {
    const updated = await runTaskRemote(entry, userId, () => remoteUnscheduleTask(serverId));
    if (!updated) return;
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === 'delete') {
    await runTaskRemote(entry, userId, () => remoteDeleteTask(serverId));
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === 'patch') {
    const patch: Parameters<typeof remotePatchTask>[1] = {};
    if (payload.clearEpic === true) patch.clearEpic = true;
    if (payload.clearConference === true) patch.clearConference = true;
    if (payload.epicId) {
      patch.epicId = String(payload.epicId);
    } else if (payload.epicColor) {
      const epics = await pullEpicsCache();
      const match = findEpicByColor(epics, String(payload.epicColor));
      if (!match || isOfflineEpicId(match.id)) {
        throw new SyncDeferredError(`Cannot resolve epic color in outbox entry ${entry.id}`);
      }
      patch.epicId = match.id;
    }
    const updated = await runTaskRemote(entry, userId, () => remotePatchTask(serverId, patch));
    if (!updated) return;
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
  }
}

/** Drop tasks outbox entries that can never succeed (e.g. empty title). */
export async function reconcileTasksOutbox(): Promise<number> {
  const userId = requireUserId();
  const queue = await listOutbox(userId);
  let dropped = 0;

  for (const entry of queue.filter((e) => e.domain === 'tasks')) {
    const local = await tasksStoreGet(entry.entityId, userId);
    if (entry.op === 'create' || !(await getServerId('tasks', entry.entityId, userId))) {
      const title = await resolveTaskTitle(entry.entityId, userId, local, queue);
      if (!title) {
        await removeOutbox(entry.id, userId);
        dropped++;
      }
    }
  }

  if (dropped > 0) {
    console.warn(`[nordly:sync] Reconcile removed ${dropped} unrecoverable tasks outbox entries`);
  }
  return dropped;
}

export async function pullTasks(): Promise<void> {
  await pullEpicsCache();
  const remote = await remoteListTasks();
  for (const task of remote) {
    await tasksStoreMergeRemote(task);
  }
  await reconcileTasksStore();
}
