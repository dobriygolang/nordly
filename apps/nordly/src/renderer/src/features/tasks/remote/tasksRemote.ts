import { API_BASE_URL } from '@shared/api/config';
import { optionalJsonNumber, optionalJsonString, requireJsonString } from '@shared/api/json';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';

import type { TaskCard, TaskKind, TaskStatus, ConferenceProvider } from '../api/tasks';
import type { TaskEpic } from '../api/epics';

const BASE = `${API_BASE_URL}/v1/tracker/work/tasks`;
const EPICS_BASE = `${API_BASE_URL}/v1/tracker/work/epics`;
const TASK_KINDS = new Set<TaskKind>(['algo', 'sysdesign', 'quiz', 'reflection', 'reading', 'ml', 'custom']);
const TASK_STATUSES = new Set<TaskStatus>(['todo', 'in_progress', 'in_review', 'done', 'dismissed']);
const CONFERENCE_PROVIDERS = new Set<ConferenceProvider>(['meet', 'zoom']);

type JsonWorkTask = Record<string, unknown>;

function pickTs(obj: JsonWorkTask, key: string): string | undefined {
  const v = obj[key];
  if (typeof v === 'string' && v.length > 0) return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.dateTime === 'string' && o.dateTime.length > 0) return o.dateTime;
    const sec = o.seconds;
    if (typeof sec === 'number' && Number.isFinite(sec)) {
      return new Date(sec * 1000).toISOString();
    }
  }
  return undefined;
}

function unwrapWorkTask(raw: JsonWorkTask): TaskCard {
  const status = requireJsonString(raw, 'status') as TaskStatus;
  if (!TASK_STATUSES.has(status)) throw new Error(`Invalid task response: status ${status}`);
  const kind = requireJsonString(raw, 'kind') as TaskKind;
  if (!TASK_KINDS.has(kind)) throw new Error(`Invalid task response: kind ${kind}`);
  const conferenceProvider = optionalJsonString(raw, 'conferenceProvider');
  if (conferenceProvider && !CONFERENCE_PROVIDERS.has(conferenceProvider as ConferenceProvider)) {
    throw new Error(`Invalid task response: conferenceProvider ${conferenceProvider}`);
  }
  return {
    id: requireJsonString(raw, 'id'),
    status,
    kind,
    title: requireJsonString(raw, 'title'),
    createdAt: requireJsonString(raw, 'createdAt'),
    updatedAt: requireJsonString(raw, 'updatedAt'),
    completedAt: pickTs(raw, 'completedAt'),
    scheduledStart: pickTs(raw, 'scheduledStart'),
    scheduledDurationMin: optionalJsonNumber(raw, 'scheduledDurationMin'),
    googleEventId: optionalJsonString(raw, 'googleEventId'),
    epicId: optionalJsonString(raw, 'epicId'),
    conferenceUrl: optionalJsonString(raw, 'conferenceUrl'),
    conferenceProvider: conferenceProvider ? (conferenceProvider as ConferenceProvider) : undefined,
  };
}

function unwrapTaskResponse(j: unknown): TaskCard {
  if (!j || typeof j !== 'object') throw new Error('Invalid task response: expected object');
  const obj = j as Record<string, unknown>;
  const task = obj.task;
  if (!task || typeof task !== 'object') throw new Error('Invalid task response: missing task');
  return unwrapWorkTask(task as JsonWorkTask);
}

export async function remoteListTasks(): Promise<TaskCard[]> {
  const resp = await apiFetch(BASE, { headers: syncAuthHeaders() });
  if (!resp.ok) throw new Error(`listTasks: ${resp.status}`);
  const j = (await resp.json()) as { tasks?: JsonWorkTask[] };
  if (!Array.isArray(j.tasks)) throw new Error('Invalid task response: missing tasks');
  return j.tasks.map(unwrapWorkTask);
}

export async function remoteCreateTask(input: { title: string; kind?: TaskKind }): Promise<TaskCard> {
  const title = input.title.trim();
  if (!title) throw new Error('Cannot create task with empty title');
  const resp = await apiFetch(BASE, {
    method: 'POST',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ kind: input.kind ?? 'custom', title }),
  });
  if (!resp.ok) throw new Error(`createTask: ${resp.status}`);
  return unwrapTaskResponse(await resp.json());
}

export async function remoteMoveTaskStatus(taskId: string, status: TaskStatus): Promise<TaskCard> {
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}/status`, {
    method: 'POST',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ id: taskId, status }),
  });
  if (!resp.ok) throw new Error(`moveTaskStatus: ${resp.status}`);
  return unwrapTaskResponse(await resp.json());
}

export async function remoteDeleteTask(taskId: string): Promise<void> {
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    headers: syncAuthHeaders(),
  });
  if (!resp.ok) throw new Error(`deleteTask: ${resp.status}`);
}

export async function remoteScheduleTask(
  taskId: string,
  start: Date | string,
  durationMin: number,
): Promise<TaskCard> {
  const startIso =
    typeof start === 'string'
      ? start
      : Number.isNaN(start.getTime())
        ? (() => {
            throw new Error(`Invalid remote schedule date for task: ${taskId}`);
          })()
        : start.toISOString();
  const duration = Math.max(15, Math.min(480, durationMin));
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}/schedule`, {
    method: 'POST',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ scheduledStartIso: startIso, durationMin: duration }),
  });
  if (!resp.ok) throw new Error(`scheduleTask: ${resp.status}`);
  return unwrapTaskResponse(await resp.json());
}

export async function remoteUnscheduleTask(taskId: string): Promise<TaskCard> {
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}/unschedule`, {
    method: 'POST',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ id: taskId }),
  });
  if (!resp.ok) throw new Error(`unscheduleTask: ${resp.status}`);
  return unwrapTaskResponse(await resp.json());
}

export async function remotePatchTask(
  taskId: string,
  patch: { epicId?: string; clearEpic?: boolean; clearConference?: boolean },
): Promise<TaskCard> {
  const body: Record<string, unknown> = { id: taskId };
  if (patch.clearEpic) body.clearEpic = true;
  else if (patch.epicId) body.epicId = patch.epicId;
  if (patch.clearConference) body.clearConference = true;
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`patchTask: ${resp.status}`);
  return unwrapTaskResponse(await resp.json());
}

export async function remoteCreateTaskConference(
  taskId: string,
  provider: ConferenceProvider,
): Promise<TaskCard> {
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}/conference`, {
    method: 'POST',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ id: taskId, provider }),
  });
  if (!resp.ok) {
    const msg = await resp.text();
    if (msg.includes('google_not_connected')) throw new Error('google_not_connected');
    if (msg.includes('google_reauth_required')) throw new Error('google_reauth_required');
    if (msg.includes('zoom_not_connected')) throw new Error('zoom_not_connected');
    if (msg.includes('zoom_reauth_required')) throw new Error('zoom_reauth_required');
    if (resp.status === 404) throw new Error('conference_not_available');
    throw new Error(`createTaskConference: ${resp.status}`);
  }
  return unwrapTaskResponse(await resp.json());
}

export async function remoteListEpics(): Promise<TaskEpic[]> {
  const resp = await apiFetch(EPICS_BASE, { headers: syncAuthHeaders() });
  if (!resp.ok) throw new Error(`listEpics: ${resp.status}`);
  const j = (await resp.json()) as { epics?: Record<string, unknown>[] };
  if (!Array.isArray(j.epics)) throw new Error('Invalid epics response: missing epics');
  return j.epics.map((raw) => ({
    id: requireJsonString(raw, 'id'),
    name: requireJsonString(raw, 'name'),
    color: requireJsonString(raw, 'color'),
  }));
}
