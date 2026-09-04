import { addDays, parseDayKey, toDayKey } from '@shared/lib/dates';
import { API_BASE_URL } from '@shared/api/config';
import { requireOk } from '@shared/api/errors';
import {
  optionalJsonDate,
  optionalJsonStringOrEmpty,
  parseJsonDate,
  requireJsonNumber,
  requireJsonString,
} from '@shared/api/json';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { focusModeFromWire, focusModeToWire } from './wireEnums';
import type { FocusTimerMode } from '@shared/model/pomodoro';

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
}

export interface FocusSession {
  id: string;
  planItemId: string;
  pinnedTitle: string;
  startedAt: Date;
  endedAt: Date | null;
  pomodorosCompleted: number;
  secondsFocused: number;
  mode: FocusTimerMode;
}

function focusJsonHeaders(): HeadersInit {
  return syncAuthHeaders({ 'content-type': 'application/json' });
}

function requireNonNegativeInteger(
  raw: Record<string, unknown>,
  field: string,
): number {
  const value = requireJsonNumber(raw, field);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Invalid focus response: bad ${field}`);
  }
  return value;
}

function unwrapSession(raw: Record<string, unknown>): FocusSession {
  return {
    id: requireJsonString(raw, 'id'),
    planItemId: optionalJsonStringOrEmpty(raw, 'taskId'),
    // Proto3 omits empty strings; untitled focus sessions are valid.
    pinnedTitle: optionalJsonStringOrEmpty(raw, 'pinnedTitle'),
    startedAt: parseJsonDate(raw.startedAt, 'startedAt'),
    endedAt: optionalJsonDate(raw.endedAt),
    secondsFocused: requireNonNegativeInteger(raw, 'secondsFocused'),
    pomodorosCompleted: requireNonNegativeInteger(raw, 'pomodorosCompleted'),
    mode: requireFocusMode(raw),
  };
}

function requireFocusMode(raw: Record<string, unknown>): FocusTimerMode {
  return focusModeFromWire(requireJsonString(raw, 'mode'));
}

function unwrapDay(raw: Record<string, unknown>): FocusDay {
  const date = requireJsonString(raw, 'date');
  parseDayKey(date);
  return {
    date,
    seconds: requireNonNegativeInteger(raw, 'seconds'),
    sessions: requireNonNegativeInteger(raw, 'sessions'),
  };
}

function sameFocusDays(a: FocusDay[], b: FocusDay[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (left.date !== right.date || left.seconds !== right.seconds || left.sessions !== right.sessions) {
      return false;
    }
  }
  return true;
}

export function sameNordlyStats(a: NordlyStats, b: NordlyStats): boolean {
  return (
    a.currentStreakDays === b.currentStreakDays &&
    a.longestStreakDays === b.longestStreakDays &&
    a.totalFocusedSeconds === b.totalFocusedSeconds &&
    sameFocusDays(a.lastSevenDays, b.lastSevenDays) &&
    sameFocusDays(a.heatmap, b.heatmap)
  );
}

export async function remoteGetStats(upToDate?: string): Promise<NordlyStats> {
  const qs = upToDate ? `?up_to_date=${encodeURIComponent(upToDate)}` : '';
  const resp = await apiFetch(`${API_BASE_URL}/v1/focus/stats${qs}`, { headers: syncAuthHeaders() });
  requireOk(resp, 'getStats');
  const j = (await resp.json()) as Record<string, unknown>;
  if (!Array.isArray(j.heatmap)) throw new Error('Invalid focus stats response: missing heatmap');
  const lastSeven = j.lastSevenDays;
  if (!Array.isArray(lastSeven)) throw new Error('Invalid focus stats response: missing lastSevenDays');
  return {
    currentStreakDays: requireNonNegativeInteger(j, 'currentStreakDays'),
    longestStreakDays: requireNonNegativeInteger(j, 'longestStreakDays'),
    totalFocusedSeconds: requireNonNegativeInteger(j, 'totalFocusedSeconds'),
    heatmap: j.heatmap.map((d) => unwrapDay(d as Record<string, unknown>)),
    lastSevenDays: lastSeven.map((d) => unwrapDay(d as Record<string, unknown>)),
  };
}

export async function remoteStartFocusSession(args: {
  planItemId?: string;
  pinnedTitle?: string;
  mode: FocusTimerMode;
  clientSessionId: string;
  startedAt: string;
}): Promise<FocusSession> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/focus/sessions/start`, {
    method: 'POST',
    headers: focusJsonHeaders(),
    body: JSON.stringify({
      mode: focusModeToWire(args.mode),
      pinnedTitle: args.pinnedTitle,
      taskId: args.planItemId,
      clientSessionId: args.clientSessionId,
      startedAt: args.startedAt,
    }),
  });
  requireOk(resp, 'startFocusSession');
  const j = (await resp.json()) as { session?: Record<string, unknown> };
  if (!j.session) throw new Error('Invalid focus response: missing session');
  return unwrapSession(j.session);
}

export async function remoteEndFocusSession(args: {
  sessionId: string;
  pomodorosCompleted: number;
  secondsFocused: number;
  endedAt: string;
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
        endedAt: args.endedAt,
      }),
    },
  );
  requireOk(resp, 'endFocusSession');
  const j = (await resp.json()) as { session?: Record<string, unknown> };
  if (!j.session) throw new Error('Invalid focus response: missing session');
  return unwrapSession(j.session);
}

export function padToSevenDays(
  input: FocusDay[],
  upToDate = toDayKey(new Date()),
): FocusDay[] {
  const byDate = new Map(input.map((d) => [d.date, d]));
  const out: FocusDay[] = [];
  const anchor = parseDayKey(upToDate);
  for (let i = 6; i >= 0; i--) {
    const d = addDays(anchor, -i);
    const iso = toDayKey(d);
    out.push(byDate.get(iso) ?? { date: iso, seconds: 0, sessions: 0 });
  }
  return out;
}
