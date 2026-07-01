import { requireUserId } from '@shared/db/nordlyDb';
import type { TaskKind, TaskStatus } from '@features/tasks/api/tasks';
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
} from '@features/tasks/repository/tasksStore';
import { getServerId, setServerId } from '@shared/sync/idMap';
import { removeOutbox } from '@shared/sync/outbox';
import type { OutboxEntry } from '@shared/sync/types';

function isRemoteNotFound(err: unknown): boolean {
  return err instanceof Error && err.message.includes(': 404');
}

async function resolveTaskServerId(entry: OutboxEntry, userId: string): Promise<string | null> {
  const mapped = await getServerId('tasks', entry.entityId, userId);
  if (mapped) return mapped;

  const local = await tasksStoreGet(entry.entityId, userId);
  if (!local) {
    await removeOutbox(entry.id, userId);
    return null;
  }

  const created = await remoteCreateTask({ title: local.title, kind: local.kind });
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
    const created = await remoteCreateTask({
      title: String(payload.title ?? ''),
      kind: (payload.kind as TaskKind | undefined) ?? 'custom',
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
    const updated = await runTaskRemote(entry, userId, () =>
      remoteScheduleTask(
        serverId,
        String(payload.startIso ?? new Date().toISOString()),
        Number(payload.durationMin ?? 30),
      ),
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
        throw new Error('epic_color_unresolved');
      }
      patch.epicId = match.id;
    }
    const updated = await runTaskRemote(entry, userId, () => remotePatchTask(serverId, patch));
    if (!updated) return;
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
  }
}

export async function pullTasks(): Promise<void> {
  try {
    await pullEpicsCache();
  } catch {
    /* keep cached epics for offline color resolution */
  }
  const remote = await remoteListTasks();
  for (const task of remote) {
    await tasksStoreMergeRemote(task);
  }
}
