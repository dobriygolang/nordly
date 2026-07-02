import type { GoogleCalendarEvent } from '@features/calendar/api/calendarClient';
import type { TaskCard } from '@features/tasks/api/tasks';
import { translate, type Locale } from '@nordly-i18n';
import {
  formatLocaleDate,
  formatLocaleHour,
  formatLocaleTime,
  monthGridStartOffset,
  startOfLocaleWeek,
} from '@shared/lib/localeFormat';
import {
  buildDefaultScheduleDate,
  defaultDurationMin,
  parseDayKey,
  resolveScheduleStart,
  taskDayKey,
  taskScheduleStart,
  toDayKey,
} from '@shared/lib/dates';

export type CalendarEntrySource = 'task' | 'google';

export interface CalendarEntry {
  id: string;
  source: CalendarEntrySource;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  taskId?: string;
  taskStatus?: TaskCard['status'];
  epicId?: string;
  /** Resolved display tint — epicId lookup or offline epicColor. */
  epicColor?: string;
  googleEventId?: string;
  googleCalendarId?: string;
  googleEditable?: boolean;
  googleHtmlLink?: string;
}

export const CALENDAR_GRID_START_HOUR = 6;
/** Exclusive end hour — labels run through 11 PM (matches task board timeline). */
export const CALENDAR_GRID_END_HOUR = 24;
export const CALENDAR_HOUR_HEIGHT_PX = 52;

const VISIBLE_TASK_STATUSES = new Set(['todo', 'in_progress', 'in_review', 'done']);

export function startOfWeekMonday(d: Date, locale?: Locale): Date {
  return startOfLocaleWeek(d, locale);
}

export interface WeekDay {
  dayKey: string;
  date: Date;
}

export function buildWeekDays(weekStart: Date): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    return { dayKey: toDayKey(date), date };
  });
}

export function weekRange(weekStart: Date): { start: Date; end: Date } {
  const start = new Date(weekStart);
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function yearRange(year: number): { start: Date; end: Date } {
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}

function taskEntry(task: TaskCard, start: Date): CalendarEntry {
  const mins = defaultDurationMin(task);
  return {
    id: `task:${task.id}`,
    source: 'task',
    title: task.title || 'Untitled',
    start,
    end: new Date(start.getTime() + mins * 60_000),
    allDay: false,
    taskId: task.id,
    taskStatus: task.status,
    epicId: task.epicId,
    epicColor: task.epicColor,
    googleEventId: task.googleEventId,
  };
}

export interface PlannedTaskBlock {
  task: TaskCard;
  start: Date;
  end: Date;
}

/** Same day + time placement as task board columns and modal calendar. */
export function tasksPlannedForDay(
  dayKey: string,
  tasks: TaskCard[],
  now = new Date(),
): PlannedTaskBlock[] {
  const todayKey = toDayKey(now);
  const day = parseDayKey(dayKey);
  const dayTasks = tasks.filter((task) => {
    if (!VISIBLE_TASK_STATUSES.has(task.status)) return false;
    const key = task.scheduledStart ? taskDayKey(task) : todayKey;
    return key === dayKey;
  });

  const sorted = [...dayTasks].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const aStart = taskScheduleStart(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bStart = taskScheduleStart(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });

  const out: PlannedTaskBlock[] = [];
  let preferred = buildDefaultScheduleDate(day, now);
  for (const task of sorted) {
    const scheduled = taskScheduleStart(task);
    const start =
      scheduled && toDayKey(scheduled) === dayKey
        ? scheduled
        : resolveScheduleStart(dayKey, sorted, preferred, task.id);
    const mins = defaultDurationMin(task);
    out.push({
      task,
      start,
      end: new Date(start.getTime() + mins * 60_000),
    });
    if (!scheduled || toDayKey(scheduled) !== dayKey) {
      preferred = new Date(start.getTime() + mins * 60_000 + 5 * 60_000);
    }
  }
  return out;
}

export function tasksToCalendarEntries(tasks: TaskCard[], now = new Date()): CalendarEntry[] {
  const todayKey = toDayKey(now);
  const visible = tasks.filter((task) => VISIBLE_TASK_STATUSES.has(task.status));
  const dayKeys = new Set<string>();
  for (const task of visible) {
    dayKeys.add(task.scheduledStart ? taskDayKey(task) : todayKey);
  }
  const out: CalendarEntry[] = [];
  for (const dayKey of dayKeys) {
    for (const block of tasksPlannedForDay(dayKey, tasks, now)) {
      out.push(taskEntry(block.task, block.start));
    }
  }
  return out;
}

export function googleToCalendarEntries(
  events: GoogleCalendarEvent[],
  linkedGoogleIds: Set<string>,
): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const ev of events) {
    if (linkedGoogleIds.has(ev.id)) continue;
    const start = new Date(ev.start);
    const end = ev.end ? new Date(ev.end) : new Date(start.getTime() + 60 * 60_000);
    if (Number.isNaN(start.getTime())) continue;
    out.push({
      id: `google:${ev.id}`,
      source: 'google',
      title: ev.title,
      start,
      end: Number.isNaN(end.getTime()) ? new Date(start.getTime() + 60 * 60_000) : end,
      allDay: ev.allDay,
      googleEventId: ev.id,
      googleCalendarId: ev.calendarId,
      googleEditable: ev.editable,
      googleHtmlLink: ev.htmlLink,
    });
  }
  return out;
}

export function linkedGoogleEventIds(tasks: TaskCard[]): Set<string> {
  return new Set(tasks.map((task) => task.googleEventId).filter((id): id is string => Boolean(id)));
}

export function mergeCalendarEntries(
  tasks: TaskCard[],
  googleEvents: GoogleCalendarEvent[],
  now = new Date(),
): CalendarEntry[] {
  const taskEntries = tasksToCalendarEntries(tasks, now);
  const linked = linkedGoogleEventIds(tasks);
  const googleEntries = googleToCalendarEntries(googleEvents, linked);
  return [...taskEntries, ...googleEntries].sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function entriesForDay(entries: CalendarEntry[], dayKey: string): CalendarEntry[] {
  return entries.filter((e) => toDayKey(e.start) === dayKey);
}

/** Whether an all-day entry occupies a given calendar day (supports multi-day spans). */
export function allDayEntryOnDay(entry: CalendarEntry, dayKey: string): boolean {
  if (!entry.allDay) return false;
  const dayStart = parseDayKey(dayKey).getTime();
  const dayEnd = dayStart + 86_400_000;
  const evStart = parseDayKey(toDayKey(entry.start)).getTime();
  const evEnd = entry.end.getTime();
  return evStart < dayEnd && evEnd > dayStart;
}

export function allDayEntriesForDay(entries: CalendarEntry[], dayKey: string): CalendarEntry[] {
  return entries.filter((e) => allDayEntryOnDay(e, dayKey));
}

export function timedEntriesForDay(entries: CalendarEntry[], dayKey: string): CalendarEntry[] {
  return entries.filter((e) => !e.allDay && toDayKey(e.start) === dayKey);
}

export function entriesForWeek(entries: CalendarEntry[], weekStart: Date): CalendarEntry[] {
  const days = buildWeekDays(weekStart);
  const keys = new Set(days.map((d) => d.dayKey));
  const weekStartMs = parseDayKey(days[0].dayKey).getTime();
  const weekEndMs = parseDayKey(days[6].dayKey).getTime() + 86_400_000;

  return entries.filter((e) => {
    if (e.allDay) {
      const evStart = parseDayKey(toDayKey(e.start)).getTime();
      return evStart < weekEndMs && e.end.getTime() > weekStartMs;
    }
    return keys.has(toDayKey(e.start));
  });
}

export function entriesForYear(entries: CalendarEntry[], year: number): CalendarEntry[] {
  return entries.filter((e) => e.start.getFullYear() === year);
}

export function eventBlockLayout(
  entry: CalendarEntry,
  hourHeight = CALENDAR_HOUR_HEIGHT_PX,
): { top: number; height: number } | null {
  if (entry.allDay) return null;

  const startH = entry.start.getHours() + entry.start.getMinutes() / 60;
  let endH = entry.end.getHours() + entry.end.getMinutes() / 60;
  if (toDayKey(entry.end) !== toDayKey(entry.start) || endH <= startH) {
    endH = startH + Math.max(0.5, (entry.end.getTime() - entry.start.getTime()) / 3_600_000);
  }

  const gridSpan = CALENDAR_GRID_END_HOUR - CALENDAR_GRID_START_HOUR;
  const maxTop = gridSpan * hourHeight;
  let top = (startH - CALENDAR_GRID_START_HOUR) * hourHeight;
  let height = Math.max((endH - startH) * hourHeight, 22);

  if (top < 0) {
    height += top;
    top = 0;
  }
  if (top >= maxTop) {
    top = Math.max(0, maxTop - 22);
    height = 22;
  } else if (top + height > maxTop) {
    height = Math.max(22, maxTop - top);
  }

  return { top, height };
}

export interface TimedEventLayout {
  entry: CalendarEntry;
  top: number;
  height: number;
  column: number;
  columnCount: number;
}

function entryTimeRangeMs(entry: CalendarEntry): { start: number; end: number } {
  const start = entry.start.getTime();
  let end = entry.end.getTime();
  if (end <= start) end = start + 30 * 60_000;
  return { start, end };
}

function timedEventsOverlap(a: CalendarEntry, b: CalendarEntry): boolean {
  const ar = entryTimeRangeMs(a);
  const br = entryTimeRangeMs(b);
  return ar.start < br.end && br.start < ar.end;
}

/** Side-by-side column layout for overlapping timed events on one day. */
export function layoutTimedEntriesForDay(
  entries: CalendarEntry[],
  hourHeight = CALENDAR_HOUR_HEIGHT_PX,
): TimedEventLayout[] {
  const timed = entries.filter((e) => !e.allDay);
  if (timed.length === 0) return [];

  const sorted = [...timed].sort((a, b) => {
    const diff = a.start.getTime() - b.start.getTime();
    if (diff !== 0) return diff;
    const aDur = entryTimeRangeMs(a).end - entryTimeRangeMs(a).start;
    const bDur = entryTimeRangeMs(b).end - entryTimeRangeMs(b).start;
    return bDur - aDur;
  });

  const n = sorted.length;
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    let cur = i;
    while (parent[cur] !== cur) {
      const next = parent[cur];
      parent[cur] = root;
      cur = next;
    }
    return root;
  };
  const union = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (timedEventsOverlap(sorted[i], sorted[j])) union(i, j);
    }
  }

  const groups = new Map<number, CalendarEntry[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(sorted[i]);
    else groups.set(root, [sorted[i]]);
  }

  const out: TimedEventLayout[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.start.getTime() - b.start.getTime());

    const columnEnds: number[] = [];
    const columnById = new Map<string, number>();

    for (const entry of group) {
      const { start, end } = entryTimeRangeMs(entry);
      let col = columnEnds.findIndex((colEnd) => colEnd <= start);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(end);
      } else {
        columnEnds[col] = end;
      }
      columnById.set(entry.id, col);
    }

    const columnCount = Math.max(1, columnEnds.length);
    for (const entry of group) {
      const block = eventBlockLayout(entry, hourHeight);
      if (!block) continue;
      out.push({
        entry,
        top: block.top,
        height: block.height,
        column: columnById.get(entry.id) ?? 0,
        columnCount,
      });
    }
  }

  return out.sort((a, b) => a.top - b.top || a.column - b.column);
}

export function calendarHourLabels(): number[] {
  const out: number[] = [];
  for (let h = CALENDAR_GRID_START_HOUR; h < CALENDAR_GRID_END_HOUR; h++) out.push(h);
  return out;
}

export function formatHourLabel(hour: number, locale?: Locale): string {
  return formatLocaleHour(hour, locale);
}

export function formatWeekHeaderMonth(date: Date, locale?: Locale): string {
  return formatLocaleDate(date, locale, { month: 'short', year: 'numeric' });
}

export function formatDayHeader(date: Date, locale?: Locale): string {
  return formatLocaleDate(date, locale, { weekday: 'short', day: 'numeric' });
}

export function monthRange(viewMonth: Date): { start: Date; end: Date } {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  return { start, end };
}

export function buildMonthGrid(
  viewMonth: Date,
  locale?: Locale,
): { dayKey: string; date: Date; inMonth: boolean }[] {
  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const first = new Date(y, m, 1);
  const startOffset = monthGridStartOffset(first, locale);
  const gridStart = new Date(y, m, 1 - startOffset);
  const cells: { dayKey: string; date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    cells.push({ dayKey: toDayKey(date), date, inMonth: date.getMonth() === m });
  }
  return cells;
}

export function formatEntryTime(entry: CalendarEntry, locale?: Locale): string {
  if (entry.allDay) return translate('nordly.calendar.all_day');
  return formatLocaleTime(entry.start, locale);
}
