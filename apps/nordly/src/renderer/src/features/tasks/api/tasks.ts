// Local-first task board — IndexedDB source of truth; background sync when enabled.
import { translate } from '@nordly-i18n';
import { tasksStoreGet, tasksStoreList, tasksStorePut, tasksStoreSoftDelete } from '@features/tasks/repository/tasksStore';
import { isTaskEpicColor, findEpicByColor, normalizeHex } from '@features/tasks/lib/epicColor';
import { epicsStoreList } from '@features/tasks/repository/epicsStore';
import { isOfflineEpicId } from '@features/tasks/api/epics';
import { getServerId } from '@shared/sync/idMap';
import { cancelOutboxForEntity, enqueueOutbox } from '@shared/sync/outbox';
import { scheduleSync } from '@shared/sync/SyncEngine';
import { isSyncQueueEnabled } from '@shared/sync/syncConfig';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { scheduleStartISO } from '@shared/lib/dates';

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done' | 'dismissed';
export type TaskKind = 'algo' | 'sysdesign' | 'quiz' | 'reflection' | 'reading' | 'ml' | 'custom';
export type ConferenceProvider = 'meet' | 'zoom';

/** UI label when a task somehow has an empty title — logs so corruption stays visible. */
export function displayTaskTitle(title: string, taskId?: string, fallback?: string): string {
  const trimmed = title.trim();
  if (trimmed) return trimmed;
  console.error('[nordly:tasks] missing title', taskId ?? '');
  return fallback ?? translate('nordly.taskboard.untitled');
}

export type TaskEpicSelection = { epicId: string } | { color: string } | null;

export interface TaskCard {
  id: string;
  status: TaskStatus;
  kind: TaskKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  scheduledStart?: string;
  scheduledDurationMin?: number;
  googleEventId?: string;
  /** Synced epic id from tracker. */
  epicId?: string;
  /** Local tint persisted on existing rows; new assignments require a synced `epicId`. */
  epicColor?: string;
  conferenceUrl?: string;
  conferenceProvider?: ConferenceProvider;
  /** Zoom meeting id when conferenceProvider is zoom (device-created). */
  zoomMeetingId?: string;
  /** Manual order within a day column. Undefined → derived from schedule/createdAt. */
  order?: number;
}

async function resolveTask(id: string): Promise<TaskCard | null> {
  const direct = await tasksStoreGet(id);
  if (direct) return direct;
  const serverId = await getServerId('tasks', id);
  if (serverId && serverId !== id) return tasksStoreGet(serverId);
  return null;
}

export async function listTasks(): Promise<TaskCard[]> {
  return tasksStoreList();
}

export async function createTask(input: { title: string; kind: TaskKind }): Promise<TaskCard> {
  const title = input.title.trim();
  if (!title) throw new Error('Task title is required');
  if (!input.kind) throw new Error('Task kind is required');
  const now = new Date().toISOString();
  const task: TaskCard = {
    id: crypto.randomUUID(),
    status: 'todo',
    kind: input.kind,
    title,
    createdAt: now,
    updatedAt: now,
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled()) {
    await enqueueOutbox('tasks', 'create', task.id, {
      title: task.title,
      kind: task.kind,
    });
    scheduleSync();
  }
  return task;
}

async function enqueueTaskOutbox(
  aliasOrId: string,
  canonicalId: string,
  op: Parameters<typeof enqueueOutbox>[1],
  payload: unknown,
): Promise<void> {
  if (aliasOrId !== canonicalId) await cancelOutboxForEntity('tasks', aliasOrId);
  await enqueueOutbox('tasks', op, canonicalId, payload);
}

export async function moveTaskStatus(taskId: string, status: TaskStatus): Promise<TaskCard> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);
  const now = new Date().toISOString();
  const task: TaskCard = {
    ...prev,
    status,
    updatedAt: now,
    completedAt: status === 'done' ? now : prev.completedAt,
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled()) {
    await enqueueTaskOutbox(taskId, prev.id, 'status', { status });
    scheduleSync();
  }
  return task;
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
  return task;
}

export async function scheduleTask(
  taskId: string,
  start: Date | string,
  durationMin: number,
): Promise<TaskCard> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);
  const startIso = scheduleStartISO(start);
  const task: TaskCard = {
    ...prev,
    scheduledStart: startIso,
    scheduledDurationMin: Math.max(15, Math.min(480, durationMin)),
    updatedAt: new Date().toISOString(),
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled()) {
    await enqueueTaskOutbox(taskId, prev.id, 'schedule', {
      startIso,
      durationMin: task.scheduledDurationMin,
    });
    scheduleSync();
  }
  return task;
}

export async function deleteTask(taskId: string): Promise<void> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);
  const id = prev.id;
  await tasksStoreSoftDelete(id);
  if (isSyncQueueEnabled()) {
    if (taskId !== id) await cancelOutboxForEntity('tasks', taskId);
    await cancelOutboxForEntity('tasks', id);
    await enqueueOutbox('tasks', 'delete', id, {});
    scheduleSync();
  }
  window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
}

/**
 * Persist a manual reordering of tasks within a day column. Reassigns dense
 * sequential `order` values and stores them locally. Order is a local-first
 * field — it is not pushed to the backend (tracker has no order column), so
 * reordering stays intact on-device and across reloads; remote pull preserves
 * any local `order` already stored.
 */
export async function reorderTasks(updated: TaskCard[]): Promise<void> {
  for (const t of updated) await tasksStorePut(t);
  window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
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
      await enqueueTaskOutbox(taskId, prev.id, 'patch', { clearEpic: true });
    } else if (epicId) {
      await enqueueTaskOutbox(taskId, prev.id, 'patch', { epicId });
    } else if (epicColor) {
      await enqueueTaskOutbox(taskId, prev.id, 'patch', { epicColor });
    }
    scheduleSync();
  }

  window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
  return task;
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
    zoomMeetingId: patch.clearConference ? undefined : prev.zoomMeetingId,
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled() && patch.clearConference) {
    await enqueueTaskOutbox(taskId, prev.id, 'patch', {
      clearConference: true,
    });
    scheduleSync();
  }
  return task;
}

export async function createTaskConference(
  taskId: string,
  provider: ConferenceProvider,
): Promise<TaskCard> {
  const prev = await resolveTask(taskId);
  if (!prev) throw new Error(`Task not found: ${taskId}`);

  const title = prev.title.trim();
  if (!title) throw new Error('Task title is required');

  let conferenceUrl: string;
  let conferenceProvider: ConferenceProvider = provider;
  let googleEventId = prev.googleEventId;
  let zoomMeetingId: string | undefined;

  if (provider === 'meet') {
    const { createGoogleMeetForTask } = await import('@features/calendar/api/calendarClient');
    const start = prev.scheduledStart
      ? new Date(prev.scheduledStart)
      : new Date();
    const durationMin =
      prev.scheduledDurationMin && prev.scheduledDurationMin > 0
        ? prev.scheduledDurationMin
        : 30;
    const end = new Date(start.getTime() + durationMin * 60_000);
    const meet = await createGoogleMeetForTask({
      title,
      start,
      end,
      existingEventId: prev.googleEventId,
    });
    conferenceUrl = meet.meetUrl;
    googleEventId = meet.googleEventId;
  } else {
    const { createZoomMeeting } = await import('@features/calendar/api/calendarClient');
    const meeting = await createZoomMeeting({
      topic: title,
      start: prev.scheduledStart ? new Date(prev.scheduledStart) : undefined,
      durationMin: prev.scheduledDurationMin,
    });
    conferenceUrl = meeting.joinUrl;
    zoomMeetingId = meeting.id;
  }

  const now = new Date().toISOString();
  const task: TaskCard = {
    ...prev,
    updatedAt: now,
    conferenceUrl,
    conferenceProvider,
    googleEventId,
    zoomMeetingId,
  };
  await tasksStorePut(task);
  if (isSyncQueueEnabled()) {
    await enqueueTaskOutbox(taskId, prev.id, 'patch', {
      conferenceUrl,
      conferenceProvider,
      googleEventId: googleEventId ?? null,
      zoomMeetingId: zoomMeetingId ?? null,
    });
    scheduleSync();
  }
  window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
  if (provider === 'meet') {
    void import('@features/calendar/api/calendar').then(
      ({ invalidateGoogleCalendarCache, refreshGoogleCalendarCache }) => {
        invalidateGoogleCalendarCache();
        void refreshGoogleCalendarCache();
      },
    );
  }
  return task;
}
