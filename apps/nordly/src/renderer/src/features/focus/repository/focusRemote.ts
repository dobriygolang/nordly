import { addDays, parseDayKey, toDayKey } from '@shared/lib/dates';
import { API_BASE_URL } from '@shared/api/config';
import {
  optionalJsonDate,
  requireJsonNumber,
  requireJsonObject,
  requireJsonString,
} from '@shared/api/json';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';

export interface FocusDay {
  date: string;
  seconds: number;
  sessions: number;
}

export interface NordlyStats {
  currentStreakDays: number;
  longestStreakDays: number;
  totalFocusedSeconds: number;
  heatmap: FocusDay[];
  lastSevenDays: FocusDay[];
  queue: QueueStats;
}

export interface QueueStats {
  todayTotal: number;
  todayDone: number;
  aiShare: number;
  userShare: number;
}

export interface FocusSession {
  id: string;
  planItemId: string;
  pinnedTitle: string;
  startedAt: Date | null;
  endedAt: Date | null;
  pomodorosCompleted: number;
  secondsFocused: number;
  mode: string;
}

function focusJsonHeaders(): HeadersInit {
  return syncAuthHeaders({ 'content-type': 'application/json' });
}

function unwrapSession(raw: Record<string, unknown>): FocusSession {
  return {
    id: requireJsonString(raw, 'id'),
    planItemId: requireJsonString(raw, 'taskId'),
    pinnedTitle: requireJsonString(raw, 'pinnedTitle'),
    startedAt: optionalJsonDate(raw.startedAt),
    endedAt: optionalJsonDate(raw.endedAt),
    secondsFocused: requireJsonNumber(raw, 'secondsFocused'),
    pomodorosCompleted: requireJsonNumber(raw, 'pomodorosCompleted'),
    mode: requireJsonString(raw, 'mode'),
  };
}

function unwrapDay(raw: Record<string, unknown>): FocusDay {
  return {
    date: requireJsonString(raw, 'date'),
    seconds: requireJsonNumber(raw, 'seconds'),
    sessions: requireJsonNumber(raw, 'sessions'),
  };
}

export async function remoteGetStats(upToDate?: string): Promise<NordlyStats> {
  const qs = upToDate ? `?up_to_date=${encodeURIComponent(upToDate)}` : '';
  const resp = await apiFetch(`${API_BASE_URL}/v1/focus/stats${qs}`, { headers: syncAuthHeaders() });
  if (!resp.ok) throw new Error(`getStats failed: ${resp.status}`);
  const j = (await resp.json()) as Record<string, unknown>;
  if (!Array.isArray(j.heatmap)) throw new Error('Invalid focus stats response: missing heatmap');
  const lastSeven = j.lastSevenDays;
  if (!Array.isArray(lastSeven)) throw new Error('Invalid focus stats response: missing lastSevenDays');
  const queue = requireJsonObject(j, 'queue');
  return {
    currentStreakDays: requireJsonNumber(j, 'currentStreakDays'),
    longestStreakDays: requireJsonNumber(j, 'longestStreakDays'),
    totalFocusedSeconds: requireJsonNumber(j, 'totalFocusedSeconds'),
    heatmap: j.heatmap.map((d) => unwrapDay(d as Record<string, unknown>)),
    lastSevenDays: lastSeven.map((d) => unwrapDay(d as Record<string, unknown>)),
    queue: {
      todayTotal: requireJsonNumber(queue, 'todayTotal'),
      todayDone: requireJsonNumber(queue, 'todayDone'),
      aiShare: requireJsonNumber(queue, 'aiShare'),
      userShare: requireJsonNumber(queue, 'userShare'),
    },
  };
}

export async function remoteStartFocusSession(args: {
  planItemId?: string;
  pinnedTitle?: string;
  mode?: 'pomodoro' | 'stopwatch';
}): Promise<FocusSession> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/focus/sessions/start`, {
    method: 'POST',
    headers: focusJsonHeaders(),
    body: JSON.stringify({
      mode: args.mode ?? 'pomodoro',
      pinnedTitle: args.pinnedTitle ?? '',
      taskId: args.planItemId ?? '',
    }),
  });
  if (!resp.ok) throw new Error(`startFocusSession failed: ${resp.status}`);
  const j = (await resp.json()) as { session?: Record<string, unknown> };
  if (!j.session) throw new Error('Invalid focus response: missing session');
  return unwrapSession(j.session);
}

export async function remoteEndFocusSession(args: {
  sessionId: string;
  pomodorosCompleted: number;
  secondsFocused: number;
}): Promise<FocusSession> {
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/focus/sessions/${encodeURIComponent(args.sessionId)}/end`,
    {
      method: 'POST',
      headers: focusJsonHeaders(),
      body: JSON.stringify({
        sessionId: args.sessionId,
        pomodorosCompleted: args.pomodorosCompleted,
        secondsFocused: args.secondsFocused,
      }),
    },
  );
  if (!resp.ok) throw new Error(`endFocusSession failed: ${resp.status}`);
  const j = (await resp.json()) as { session?: Record<string, unknown> };
  if (!j.session) throw new Error('Invalid focus response: missing session');
  return unwrapSession(j.session);
}

export function padToSevenDays(input: FocusDay[]): FocusDay[] {
  const byDate = new Map(input.map((d) => [d.date, d]));
  const out: FocusDay[] = [];
  const todayKey = toDayKey(new Date());
  const anchor = parseDayKey(todayKey);
  for (let i = 6; i >= 0; i--) {
    const d = addDays(anchor, -i);
    const iso = toDayKey(d);
    out.push(byDate.get(iso) ?? { date: iso, seconds: 0, sessions: 0 });
  }
  return out;
}
