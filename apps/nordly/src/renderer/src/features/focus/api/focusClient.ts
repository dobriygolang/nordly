// Local-first focus — sessions in IndexedDB; stats merged from server when sync enabled.
import { listTasks } from '@features/tasks/api/tasks';
import { focusStoreGet, focusStorePut, rowFrom } from '@features/focus/repository/focusStore';
import {
  padToSevenDays,
  remoteGetStats,
  type FocusDay,
  type FocusSession,
  type NordlyStats,
  type QueueStats,
} from '@features/focus/repository/focusRemote';
import { focusStoreList } from '@features/focus/repository/focusStore';
import { addDays, parseDayKey, toDayKey } from '@pages/TaskBoard/lib/dates';
import { requireUserId } from '@shared/db/nordlyDb';
import { enqueueOutbox } from '@shared/sync/outbox';
import { scheduleSync } from '@shared/sync/SyncEngine';
import { canReachNetwork, isSyncEnabled } from '@shared/sync/syncConfig';

export type { FocusDay, FocusSession, NordlyStats, QueueStats };
export { padToSevenDays };

interface StoredSession {
  id: string;
  planItemId: string;
  pinnedTitle: string;
  startedAt: string;
  endedAt: string | null;
  pomodorosCompleted: number;
  secondsFocused: number;
  mode: string;
  synced?: boolean;
}

type StatsCore = Omit<NordlyStats, 'queue'>;

function toSession(row: StoredSession): FocusSession {
  return {
    id: row.id,
    planItemId: row.planItemId,
    pinnedTitle: row.pinnedTitle,
    startedAt: row.startedAt ? new Date(row.startedAt) : null,
    endedAt: row.endedAt ? new Date(row.endedAt) : null,
    pomodorosCompleted: row.pomodorosCompleted,
    secondsFocused: row.secondsFocused,
    mode: row.mode,
  };
}

function aggregateDays(sessions: StoredSession[]): Map<string, FocusDay> {
  const map = new Map<string, FocusDay>();
  for (const s of sessions) {
    if (!s.endedAt || s.secondsFocused <= 0) continue;
    const key = toDayKey(new Date(s.endedAt));
    const cur = map.get(key) ?? { date: key, seconds: 0, sessions: 0 };
    cur.seconds += s.secondsFocused;
    cur.sessions += 1;
    map.set(key, cur);
  }
  return map;
}

function streakFromDays(days: Set<string>, anchor: string): number {
  let streak = 0;
  let d = parseDayKey(anchor);
  for (;;) {
    const key = toDayKey(d);
    if (!days.has(key)) break;
    streak += 1;
    d = addDays(d, -1);
  }
  return streak;
}

function statsFromSessions(sessions: StoredSession[], upToDate?: string): StatsCore {
  const byDay = aggregateDays(sessions);
  const heatmap = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const anchor = upToDate ?? toDayKey(new Date());
  const lastSevenDays = padToSevenDays(heatmap.filter((d) => d.date <= anchor));
  const activeDays = new Set(heatmap.filter((d) => d.seconds > 0).map((d) => d.date));
  const totalFocusedSeconds = sessions.reduce((sum, s) => sum + (s.secondsFocused ?? 0), 0);

  let longest = 0;
  for (const date of [...activeDays].sort()) {
    longest = Math.max(longest, streakFromDays(activeDays, date));
  }

  return {
    currentStreakDays: streakFromDays(activeDays, anchor),
    longestStreakDays: longest,
    totalFocusedSeconds,
    heatmap,
    lastSevenDays,
  };
}

function mergeFocusDays(a: FocusDay[], b: FocusDay[]): FocusDay[] {
  const map = new Map<string, FocusDay>();
  for (const d of a) map.set(d.date, { ...d });
  for (const d of b) {
    const cur = map.get(d.date);
    if (!cur) {
      map.set(d.date, { ...d });
      continue;
    }
    map.set(d.date, {
      date: d.date,
      seconds: cur.seconds + d.seconds,
      sessions: cur.sessions + d.sessions,
    });
  }
  return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
}

/** Prefer the higher per-day totals — avoids stale remote wiping synced local data. */
function mergeFocusDaysMax(a: FocusDay[], b: FocusDay[]): FocusDay[] {
  const map = new Map<string, FocusDay>();
  for (const d of [...a, ...b]) {
    const cur = map.get(d.date);
    if (!cur || d.seconds > cur.seconds) {
      map.set(d.date, { ...d });
      continue;
    }
    if (d.seconds === cur.seconds) {
      map.set(d.date, { date: d.date, seconds: cur.seconds, sessions: Math.max(cur.sessions, d.sessions) });
    }
  }
  return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
}

function statsFromHeatmap(heatmap: FocusDay[], upToDate?: string): StatsCore {
  const anchor = upToDate ?? toDayKey(new Date());
  const lastSevenDays = padToSevenDays(heatmap.filter((d) => d.date <= anchor));
  const activeDays = new Set(heatmap.filter((d) => d.seconds > 0).map((d) => d.date));
  const totalFocusedSeconds = heatmap.reduce((sum, d) => sum + d.seconds, 0);

  let longest = 0;
  for (const date of [...activeDays].sort()) {
    longest = Math.max(longest, streakFromDays(activeDays, date));
  }

  return {
    currentStreakDays: streakFromDays(activeDays, anchor),
    longestStreakDays: longest,
    totalFocusedSeconds,
    heatmap,
    lastSevenDays,
  };
}

function mergeStats(base: StatsCore, extra: StatsCore, upToDate?: string): StatsCore {
  const heatmap = mergeFocusDays(base.heatmap, extra.heatmap);
  const anchor = upToDate ?? toDayKey(new Date());
  const lastSevenDays = padToSevenDays(heatmap.filter((d) => d.date <= anchor));
  const activeDays = new Set(heatmap.filter((d) => d.seconds > 0).map((d) => d.date));

  let longest = 0;
  for (const date of [...activeDays].sort()) {
    longest = Math.max(longest, streakFromDays(activeDays, date));
  }

  return {
    currentStreakDays: streakFromDays(activeDays, anchor),
    longestStreakDays: Math.max(base.longestStreakDays, extra.longestStreakDays, longest),
    totalFocusedSeconds: base.totalFocusedSeconds + extra.totalFocusedSeconds,
    heatmap,
    lastSevenDays,
  };
}

function isRemoteStatsEmpty(remote: StatsCore): boolean {
  return remote.totalFocusedSeconds === 0 && remote.heatmap.every((d) => d.seconds === 0);
}

async function buildQueueStats(): Promise<QueueStats> {
  const tasks = await listTasks();
  const today = toDayKey(new Date());
  const todayTasks = tasks.filter((t) => {
    if (!t.scheduledStart) return false;
    return toDayKey(new Date(t.scheduledStart)) === today;
  });
  const done = todayTasks.filter((t) => t.status === 'done').length;
  return {
    todayTotal: todayTasks.length,
    todayDone: done,
    aiShare: 0,
    userShare: todayTasks.length ? 1 : 0,
  };
}

async function buildLocalStats(upToDate?: string): Promise<NordlyStats> {
  const rows = await focusStoreList();
  const sessions = rows.filter((s) => s.endedAt) as StoredSession[];
  return {
    ...statsFromSessions(sessions, upToDate),
    queue: await buildQueueStats(),
  };
}

export async function getStats(upToDate?: string): Promise<NordlyStats> {
  const local = await buildLocalStats(upToDate);
  if (!isSyncEnabled() || !canReachNetwork()) return local;

  try {
    const remote = await remoteGetStats(upToDate);
    const remoteCore: StatsCore = {
      currentStreakDays: remote.currentStreakDays,
      longestStreakDays: remote.longestStreakDays,
      totalFocusedSeconds: remote.totalFocusedSeconds,
      heatmap: remote.heatmap,
      lastSevenDays: remote.lastSevenDays,
    };

    const rows = await focusStoreList();
    const unsynced = rows.filter((s) => s.endedAt && !s.synced) as StoredSession[];
    const queue = await buildQueueStats();

    if (unsynced.length === 0) {
      if (isRemoteStatsEmpty(remoteCore) && local.totalFocusedSeconds > 0) return local;
      const mergedHeatmap = mergeFocusDaysMax(remoteCore.heatmap, local.heatmap);
      const merged = statsFromHeatmap(mergedHeatmap, upToDate);
      return {
        ...merged,
        longestStreakDays: Math.max(
          merged.longestStreakDays,
          remoteCore.longestStreakDays,
          local.longestStreakDays,
        ),
        queue,
      };
    }

    const pending = statsFromSessions(unsynced, upToDate);
    const merged = isRemoteStatsEmpty(remoteCore)
      ? pending
      : mergeStats(remoteCore, pending, upToDate);

    return { ...merged, queue };
  } catch {
    return local;
  }
}

export async function startFocusSession(args: {
  planItemId?: string;
  pinnedTitle?: string;
  mode?: 'pomodoro' | 'stopwatch';
}): Promise<FocusSession> {
  const userId = requireUserId();
  const id = crypto.randomUUID();
  const row = rowFrom(userId, {
    id,
    planItemId: args.planItemId ?? '',
    pinnedTitle: args.pinnedTitle ?? '',
    startedAt: new Date().toISOString(),
    endedAt: null,
    pomodorosCompleted: 0,
    secondsFocused: 0,
    mode: args.mode ?? 'pomodoro',
    synced: false,
  });
  await focusStorePut(row);
  if (isSyncEnabled()) {
    await enqueueOutbox('focus', 'session_start', id, {
      planItemId: args.planItemId ?? '',
      pinnedTitle: args.pinnedTitle ?? '',
      mode: args.mode ?? 'pomodoro',
    });
    scheduleSync();
  }
  return toSession(row);
}

export async function endFocusSession(args: {
  sessionId: string;
  pomodorosCompleted: number;
  secondsFocused: number;
  reflection?: string;
}): Promise<FocusSession> {
  void args.reflection;
  const userId = requireUserId();
  const prev = await focusStoreGet(args.sessionId, userId);
  if (!prev) throw new Error(`Session not found: ${args.sessionId}`);
  const row = {
    ...prev,
    endedAt: new Date().toISOString(),
    pomodorosCompleted: args.pomodorosCompleted,
    secondsFocused: args.secondsFocused,
    synced: false,
  };
  await focusStorePut(row);
  if (isSyncEnabled()) {
    await enqueueOutbox('focus', 'session_end', args.sessionId, {
      pomodorosCompleted: args.pomodorosCompleted,
      secondsFocused: args.secondsFocused,
    });
    scheduleSync();
  }
  return toSession(row);
}
