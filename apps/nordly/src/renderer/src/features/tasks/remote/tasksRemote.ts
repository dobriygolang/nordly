import { API_BASE_URL } from '@shared/api/config';
import { ApiHttpError, requireOk } from '@shared/api/errors';
import { optionalJsonNumber, optionalJsonString, requireJsonString } from '@shared/api/json';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { scheduleStartISO } from '@shared/lib/dates';

import type { TaskCard } from '../model/task';
import type { TaskEpic } from '../api/epics';
import { clampTaskDurationMin } from '../model/duration';
import type {
  ConferenceProvider,
  TaskKind,
  TaskStatus,
} from '../model/status';
import {
  TaskActionError,
  TaskActionErrorCode,
} from '../lib/taskActionErrors';
import {
  conferenceProviderFromWire,
  conferenceProviderToWire,
  taskKindFromWire,
  taskKindToWire,
  taskStatusFromWire,
  taskStatusToWire,
} from './wireEnums';

const BASE = `${API_BASE_URL}/v1/tracker/work/tasks`;
const EPICS_BASE = `${API_BASE_URL}/v1/tracker/work/epics`;

type JsonWorkTask = Record<string, unknown>;

function pickTs(obj: JsonWorkTask, key: string): string | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string' && v.length > 0) return v;
  throw new Error(`Invalid task response: bad ${key}`);
}

function unwrapWorkTask(raw: JsonWorkTask): TaskCard {
  const status = taskStatusFromWire(requireJsonString(raw, 'status'));
  const kind = taskKindFromWire(requireJsonString(raw, 'kind'));
  const conferenceProviderRaw = optionalJsonString(raw, 'conferenceProvider');
  const conferenceProvider = conferenceProviderRaw
    ? conferenceProviderFromWire(conferenceProviderRaw)
    : undefined;
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
    googleCalendarId: optionalJsonString(raw, 'googleCalendarId'),
    epicId: optionalJsonString(raw, 'epicId'),
    conferenceUrl: optionalJsonString(raw, 'conferenceUrl'),
    conferenceProvider: conferenceProvider,
    zoomMeetingId: optionalJsonString(raw, 'zoomMeetingId'),
  };
}

function unwrapTaskResponse(j: unknown): TaskCard {
  if (!j || typeof j !== 'object') throw new Error('Invalid task response: expected object');
  const obj = j as Record<string, unknown>;
  const task = obj.task;
  if (!task || typeof task !== 'object') throw new Error('Invalid task response: missing task');
  return unwrapWorkTask(task as JsonWorkTask);
}

function trackerErrorMessage(raw: unknown): string {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid tracker error response: expected object');
  }
  return requireJsonString(raw as Record<string, unknown>, 'message');
}

export async function remoteListTasks(): Promise<TaskCard[]> {
  const resp = await apiFetch(BASE, { headers: syncAuthHeaders() });
  requireOk(resp, 'listTasks');
  const j = (await resp.json()) as { tasks?: JsonWorkTask[] };
  if (!Array.isArray(j.tasks)) throw new Error('Invalid task response: missing tasks');
  return j.tasks.map(unwrapWorkTask);
}

export async function remoteCreateTask(input: { title: string; kind: TaskKind }): Promise<TaskCard> {
  const title = input.title.trim();
  if (!title) throw new Error('Cannot create task with empty title');
  const resp = await apiFetch(BASE, {
    method: 'POST',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ kind: taskKindToWire(input.kind), title }),
  });
  requireOk(resp, 'createTask');
  return unwrapTaskResponse(await resp.json());
}

export async function remoteMoveTaskStatus(taskId: string, status: TaskStatus): Promise<TaskCard> {
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}/status`, {
    method: 'POST',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ id: taskId, status: taskStatusToWire(status) }),
  });
  requireOk(resp, 'moveTaskStatus');
  return unwrapTaskResponse(await resp.json());
}

export async function remoteDeleteTask(taskId: string): Promise<void> {
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    headers: syncAuthHeaders(),
  });
  requireOk(resp, 'deleteTask');
}

export async function remoteScheduleTask(
  taskId: string,
  start: Date | string,
  durationMin: number,
): Promise<TaskCard> {
  const startIso = scheduleStartISO(start);
  const duration = clampTaskDurationMin(durationMin);
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}/schedule`, {
    method: 'POST',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ scheduledStartIso: startIso, durationMin: duration }),
  });
  requireOk(resp, 'scheduleTask');
  return unwrapTaskResponse(await resp.json());
}

export async function remotePatchTask(
  taskId: string,
  patch: {
    epicId?: string;
    clearEpic?: boolean;
    clearConference?: boolean;
    conferenceUrl?: string;
    conferenceProvider?: ConferenceProvider;
    googleEventId?: string | null;
    googleCalendarId?: string | null;
    zoomMeetingId?: string | null;
  },
): Promise<TaskCard> {
  const body: Record<string, unknown> = { id: taskId };
  if (patch.clearEpic) body.clearEpic = true;
  else if (patch.epicId) body.epicId = patch.epicId;
  if (patch.clearConference) body.clearConference = true;
  if (patch.conferenceUrl !== undefined) body.conferenceUrl = patch.conferenceUrl;
  if (patch.conferenceProvider !== undefined) {
    body.conferenceProvider = conferenceProviderToWire(patch.conferenceProvider);
  }
  if ((patch.googleEventId === undefined) !== (patch.googleCalendarId === undefined)) {
    throw new Error('patchTask requires googleEventId and googleCalendarId together');
  }
  if (patch.googleEventId !== undefined) {
    if (!patch.googleEventId || !patch.googleCalendarId) {
      throw new Error('patchTask cannot clear Google ids without clearConference');
    }
    body.googleEventId = patch.googleEventId;
    body.googleCalendarId = patch.googleCalendarId;
  }
  if (patch.zoomMeetingId !== undefined) body.zoomMeetingId = patch.zoomMeetingId ?? '';
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  requireOk(resp, 'patchTask');
  return unwrapTaskResponse(await resp.json());
}

export async function remoteCreateTaskConference(
  taskId: string,
  provider: ConferenceProvider,
): Promise<TaskCard> {
  const resp = await apiFetch(`${BASE}/${encodeURIComponent(taskId)}/conference`, {
    method: 'POST',
    headers: { ...syncAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify({ id: taskId, provider: conferenceProviderToWire(provider) }),
  });
  if (!resp.ok) {
    if (resp.status === 404) {
      throw new TaskActionError(TaskActionErrorCode.ConferenceNotAvailable);
    }
    const message = trackerErrorMessage(await resp.json());
    switch (message) {
      case TaskActionErrorCode.GoogleNotConnected:
      case TaskActionErrorCode.GoogleReauthRequired:
      case TaskActionErrorCode.ZoomNotConnected:
      case TaskActionErrorCode.ZoomReauthRequired:
        throw new TaskActionError(message);
      default:
        throw new ApiHttpError('createTaskConference', resp.status);
    }
  }
  return unwrapTaskResponse(await resp.json());
}

export async function remoteListEpics(): Promise<TaskEpic[]> {
  const resp = await apiFetch(EPICS_BASE, { headers: syncAuthHeaders() });
  requireOk(resp, 'listEpics');
  const j = (await resp.json()) as { epics?: Record<string, unknown>[] };
  if (!Array.isArray(j.epics)) throw new Error('Invalid epics response: missing epics');
  return j.epics.map((raw) => ({
    id: requireJsonString(raw, 'id'),
    name: requireJsonString(raw, 'name'),
    color: requireJsonString(raw, 'color'),
  }));
}
