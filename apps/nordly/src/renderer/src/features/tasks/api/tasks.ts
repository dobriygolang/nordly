// Local-first task board — IndexedDB source of truth; background sync when enabled.
import { translate } from '@nordly-i18n';
import {
  tasksStoreApplyRemote,
  tasksStoreGet,
  tasksStoreList,
  tasksStorePut,
  tasksStorePutMany,
  tasksStoreSoftDelete,
} from '@features/tasks/repository/tasksStore';
import { isTaskEpicColor, findEpicByColor, normalizeHex } from '@features/tasks/lib/epicColor';
import { epicsStoreList } from '@features/tasks/repository/epicsStore';
import { isOfflineEpicId } from '@features/tasks/api/epics';
import {
  TaskActionError,
  TaskActionErrorCode,
} from '@features/tasks/lib/taskActionErrors';
import { remoteCreateTaskConference } from '@features/tasks/remote/tasksRemote';
import { getServerId } from '@shared/sync/idMap';
import { cancelOutboxForEntity, enqueueOutbox } from '@shared/sync/outbox';
import {
  OutboxOp,
  SyncDomain,
  type SyncOp,
  type SyncPayload,
} from '@shared/sync/types';
import { flushSync, scheduleSync } from '@shared/sync/SyncEngine';
import { isSyncQueueEnabled } from '@shared/sync/syncConfig';
import { isCloudEnabled } from '@shared/model/features';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { scheduleStartISO } from '@shared/lib/dates';
import { clampTaskDurationMin } from '../model/duration';
import { ConferenceProvider, isTaskDone, TaskKind, TaskStatus } from '../model/status';
import type { TaskCard, TaskEpicSelection } from '../model/task';

export type { TaskCard, TaskEpicSelection } from '../model/task';

export {
  ConferenceProvider,
  CONFERENCE_PROVIDERS,
  TaskKind,
  TASK_KINDS,
  TaskStatus,
  TASK_STATUSES,
  isConferenceProvider,
  isTaskKind,
  isTaskStatus,
  isVisibleTaskStatus,
  isActiveForReminder,
  isTaskDone,
  nextTaskCompletionStatus,
  VISIBLE_TASK_STATUSES,
} from '../model/status';
export {
  TASK_DURATION_DEFAULT,
  TASK_DURATION_MAX,
  TASK_DURATION_MIN,
  TASK_DURATION_PRESETS_MIN,
  clampTaskDurationMin,
  sumTaskDurationMin,
  taskDurationMin,
} from '../model/duration';

/** UI label when a task somehow has an empty title — logs so corruption stays visible. */
export function displayTaskTitle(title: string, taskId?: string, fallback?: string): string {
  const trimmed = title.trim();
  if (trimmed) return trimmed;
  console.error('[nordly:tasks] missing title', taskId ?? '');
  return fallback ?? translate('nordly.taskboard.untitled');
}

function taskMutationSucceeded<T>(result: T): T {
  window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
  return result;
}

async function resolveTask(id: string): Promise<TaskCard | null> {
  const direct = await tasksStoreGet(id);
  if (direct) return direct;
  const serverId = await getServerId(SyncDomain.Tasks, id);
  if (serverId && serverId !== id) return tasksStoreGet(serverId);
  return null;
}

export async function listTasks(): Promise<TaskCard[]> {
  return tasksStoreList();
}

export async function createTask(input: { title: string }): Promise<TaskCard> {
  const title = input.title.trim();
  if (!title) throw new Error('Task title is required');
  const now = new Date().toISOString();
  const task: TaskCard = {
    id: crypto.randomUUID(),
    status: TaskStatus.Todo,
    kind: TaskKind.Custom,
    title,
    createdAt: now,
    updatedAt: now,
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled()) {
    await enqueueOutbox(SyncDomain.Tasks, OutboxOp.Create, task.id, {
      title: task.title,
      kind: task.kind,
    });
    scheduleSync();
  }
  return taskMutationSucceeded(task);
}

export async function createScheduledTask(input: {
  title: string;
  start: Date | string;
  durationMin: number;
}): Promise<TaskCard> {
  const title = input.title.trim();
  if (!title) throw new Error('Task title is required');
  const now = new Date().toISOString();
  const startIso = scheduleStartISO(input.start);
  const durationMin = clampTaskDurationMin(input.durationMin);
  const task: TaskCard = {
    id: crypto.randomUUID(),
    status: TaskStatus.Todo,
    kind: TaskKind.Custom,
    title,
    createdAt: now,
    updatedAt: now,
    scheduledStart: startIso,
    scheduledDurationMin: durationMin,
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled()) {
    await enqueueOutbox(SyncDomain.Tasks, OutboxOp.Create, task.id, {
      title: task.title,
      kind: task.kind,
    });
    await enqueueOutbox(SyncDomain.Tasks, OutboxOp.Schedule, task.id, {
      startIso,
      durationMin,
    });
    scheduleSync();
  }
  return taskMutationSucceeded(task);
}

async function enqueueTaskOutbox<
  O extends SyncOp<typeof SyncDomain.Tasks>,
>(
  aliasOrId: string,
  canonicalId: string,
  op: O,
  payload: SyncPayload<typeof SyncDomain.Tasks, O>,
): Promise<void> {
  if (aliasOrId !== canonicalId) await cancelOutboxForEntity(SyncDomain.Tasks, aliasOrId);
  await enqueueOutbox(SyncDomain.Tasks, op, canonicalId, payload);
}

export async function moveTaskStatus(taskId: string, status: TaskStatus): Promise<TaskCard> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);
  const now = new Date().toISOString();
  const task: TaskCard = {
    ...prev,
    status,
    updatedAt: now,
    completedAt: isTaskDone(status) ? now : undefined,
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled()) {
    await enqueueTaskOutbox(taskId, prev.id, OutboxOp.Status, { status });
    scheduleSync();
  }
  return taskMutationSucceeded(task);
}

/**
 * Inline title edit, persisted on device immediately. The tracker backend has
 * no rename/update-title RPC, so this stays local-first only (no outbox push);
 * wire an `update` outbox op here once a remote endpoint exists.
 */
export async function renameTask(taskId: string, title: string): Promise<TaskCard> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);
  const nextTitle = title.trim();
  if (!nextTitle) throw new Error('Task title is required');
  const task: TaskCard = {
    ...prev,
    title: nextTitle,
    updatedAt: new Date().toISOString(),
  };
  await tasksStorePut(task);
  return taskMutationSucceeded(task);
}

export async function scheduleTask(
  taskId: string,
  start: Date | string,
  durationMin: number,
): Promise<TaskCard> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);
  const startIso = scheduleStartISO(start);
  const scheduledDurationMin = clampTaskDurationMin(durationMin);
  const task: TaskCard = {
    ...prev,
    scheduledStart: startIso,
    scheduledDurationMin,
    updatedAt: new Date().toISOString(),
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled()) {
    await enqueueTaskOutbox(taskId, prev.id, OutboxOp.Schedule, {
      startIso,
      durationMin: scheduledDurationMin,
    });
    scheduleSync();
  }
  return taskMutationSucceeded(task);
}

export async function deleteTask(taskId: string): Promise<void> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);
  const id = prev.id;
  await tasksStoreSoftDelete(id);
  if (isSyncQueueEnabled()) {
    if (taskId !== id) await cancelOutboxForEntity(SyncDomain.Tasks, taskId);
    await cancelOutboxForEntity(SyncDomain.Tasks, id);
    await enqueueOutbox(SyncDomain.Tasks, OutboxOp.Delete, id, {});
    scheduleSync();
  }
  taskMutationSucceeded(undefined);
}

/**
 * Persist a manual reordering of tasks within a day column. Reassigns dense
 * sequential `order` values and stores them locally. Order is a local-first
 * field — it is not pushed to the backend (tracker has no order column), so
 * reordering stays intact on-device and across reloads; remote pull preserves
 * any local `order` already stored.
 */
export async function reorderTasks(updated: TaskCard[]): Promise<void> {
  if (updated.length === 0) return;
  const persisted: TaskCard[] = [];
  for (const task of updated) {
    const current = await resolveTask(task.id);
    if (!current) throw new Error(`Task not found: ${task.id}`);
    persisted.push({ ...current, order: task.order });
  }
  await tasksStorePutMany(persisted);
  taskMutationSucceeded(undefined);
}

/** Assign or clear task epic — syncs epicId when online; epicColor is offline/pending fallback. */
export async function patchTaskEpic(taskId: string, selection: TaskEpicSelection): Promise<TaskCard> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);

  const epics = await epicsStoreList();
  let epicId: string | undefined;
  let epicColor: string | undefined;

  if (selection === null) {
    epicId = undefined;
    epicColor = undefined;
  } else if ('epicId' in selection) {
    if (isOfflineEpicId(selection.epicId)) {
      throw new Error('Cannot assign offline epic stub by id — use color');
    }
    epicId = selection.epicId;
    epicColor = epics.find((e) => e.id === epicId)?.color;
  } else {
    const color = normalizeHex(selection.color);
    if (!isTaskEpicColor(color)) throw new Error(`Invalid epic color: ${color}`);
    epicColor = color;
    const match = findEpicByColor(epics, color);
    epicId = match && !isOfflineEpicId(match.id) ? match.id : undefined;
  }

  const task: TaskCard = {
    ...prev,
    epicId,
    epicColor: epicId ? undefined : epicColor,
    updatedAt: new Date().toISOString(),
  };
  await tasksStorePut(task);

  if (isSyncQueueEnabled()) {
    if (selection === null) {
      await enqueueTaskOutbox(taskId, prev.id, OutboxOp.Patch, { clearEpic: true });
    } else if (epicId) {
      await enqueueTaskOutbox(taskId, prev.id, OutboxOp.Patch, { epicId });
    } else if (epicColor) {
      await enqueueTaskOutbox(taskId, prev.id, OutboxOp.Patch, { epicColor });
    }
    scheduleSync();
  }

  return taskMutationSucceeded(task);
}

export async function patchTaskDetails(
  taskId: string,
  patch: { clearConference?: boolean },
): Promise<TaskCard> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);
  const now = new Date().toISOString();
  const task: TaskCard = {
    ...prev,
    updatedAt: now,
    conferenceUrl: patch.clearConference ? undefined : prev.conferenceUrl,
    conferenceProvider: patch.clearConference ? undefined : prev.conferenceProvider,
    googleEventId: patch.clearConference ? undefined : prev.googleEventId,
    googleCalendarId: patch.clearConference ? undefined : prev.googleCalendarId,
    zoomMeetingId: patch.clearConference ? undefined : prev.zoomMeetingId,
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled() && patch.clearConference) {
    await enqueueTaskOutbox(taskId, prev.id, OutboxOp.Patch, {
      clearConference: true,
    });
    scheduleSync();
  }
  return taskMutationSucceeded(task);
}

export async function createTaskConference(
  taskId: string,
  provider: ConferenceProvider,
): Promise<TaskCard> {
  if (!isCloudEnabled()) {
    throw new TaskActionError(TaskActionErrorCode.IntegrationsRequireCloud);
  }
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);
  let serverId = await getServerId(SyncDomain.Tasks, taskId);
  if (!serverId && isSyncQueueEnabled()) {
    // Meet/Zoom need the tracker id — push local creates first.
    // Best-effort: unrelated outbox failures must not block conference creation.
    try {
      await flushSync();
    } catch (err) {
      console.error('[nordly:tasks] flush before conference failed', err);
    }
    serverId = await getServerId(SyncDomain.Tasks, taskId);
  }
  if (!serverId) {
    throw new TaskActionError(TaskActionErrorCode.TaskNotSynced);
  }
  const updated = await remoteCreateTaskConference(serverId, provider);
  const task = await tasksStoreApplyRemote(updated);
  taskMutationSucceeded(undefined);
  if (provider === ConferenceProvider.Meet) {
    window.dispatchEvent(
      new Event(NORDLY_EVENTS.googleCalendarRefreshRequested),
    );
  }
  return task;
}
