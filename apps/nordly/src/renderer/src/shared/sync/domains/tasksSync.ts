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
import { tasksStoreMergeRemote, tasksStoreReplaceId } from '@features/tasks/repository/tasksStore';
import { resolveEntityId, setServerId } from '@shared/sync/idMap';
import { removeOutbox } from '@shared/sync/outbox';
import type { OutboxEntry } from '@shared/sync/types';

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

  const serverId = await resolveEntityId('tasks', entry.entityId, userId);

  if (entry.op === 'status') {
    const updated = await remoteMoveTaskStatus(serverId, payload.status as TaskStatus);
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === 'schedule') {
    const updated = await remoteScheduleTask(
      serverId,
      String(payload.startIso ?? new Date().toISOString()),
      Number(payload.durationMin ?? 30),
    );
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === 'unschedule') {
    const updated = await remoteUnscheduleTask(serverId);
    await tasksStoreMergeRemote(updated);
    await removeOutbox(entry.id, userId);
    return;
  }

  if (entry.op === 'delete') {
    await remoteDeleteTask(serverId);
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
    const updated = await remotePatchTask(serverId, patch);
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
