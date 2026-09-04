import type { AppleCalendarEvent } from '@features/calendar/api/appleCalendarClient';
import {
  googleEventDisplayDate,
  type GoogleCalendarEvent,
} from '@features/calendar/model/calendar';
import { displayTaskTitle } from '@features/tasks/api/tasks';
import {
  ConferenceProvider,
  isTaskDone,
  isVisibleTaskStatus,
} from '@features/tasks/model/status';
import type { TaskCard } from '@features/tasks/model/task';
import { TASK_DURATION_DEFAULT, taskDurationMin } from '@features/tasks/model/duration';
import { translate, type Locale } from '@nordly-i18n';
import {
  formatLocaleDate,
  formatLocaleHour,
  formatLocaleTime,
  monthGridStartOffset,
  startOfLocaleWeek,
} from '@shared/lib/localeFormat';
import {
  addDays,
  buildDefaultScheduleDate,
  parseDayKey,
  parseScheduleInstant,
  resolveScheduleStart,
  taskDayKey,
  taskScheduleStart,
  toDayKey,
} from '@shared/lib/dates';

import { CalendarEntrySource } from '../model/entry';

export { CalendarEntrySource };

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
  appleEventId?: string;
  appleCalendarId?: string;
  /** Present when a Nordly task has Meet/Zoom — meeting mode on the timeline. */
  conferenceUrl?: string;
  conferenceProvider?: TaskCard['conferenceProvider'];
}

/** Task with a conference link is treated as a meeting (timeline + inspect), not a plain task. */
export function taskIsMeeting(task: { conferenceUrl?: string | null }): boolean {
  return Boolean(task.conferenceUrl?.trim());
}

export const CALENDAR_GRID_START_HOUR = 6;
/**
 * Exclusive end hour on the day grid (labels 6 AM … 1 AM).
 * Hours 24–25 are the overnight spill (00:00–02:00 next morning).
 */
export const CALENDAR_GRID_END_HOUR = 26;
/** Clock hour on the next calendar day still painted at the bottom of this day's grid. */
export const CALENDAR_OVERNIGHT_END_HOUR = CALENDAR_GRID_END_HOUR - 24;
export const CALENDAR_HOUR_HEIGHT_PX = 52;
/** Click / drag snap on day grids — half-hour slots (:00 / :30), Google Calendar style. */
export const CALENDAR_TIME_SNAP_MIN = 30;

/** Instant for a grid minutes-of-day value (may be ≥ 24h for overnight slots). */
export function dateFromGridMinutes(dayKey: string, totalMin: number): Date {
  const out = parseDayKey(dayKey);
  out.setHours(0, 0, 0, 0);
  out.setMinutes(totalMin, 0, 0);
  return out;
}

/**
 * Minutes from grid day midnight for layout / editing.
 * Early morning on day+1 (before {@link CALENDAR_OVERNIGHT_END_HOUR}) maps to 24h+.
 */
export function gridMinutesFromDate(dayKey: string, d: Date): number | null {
  const startKey = toDayKey(d);
  const clockMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  if (startKey === dayKey) return clockMin;
  const nextKey = toDayKey(addDays(parseDayKey(dayKey), 1));
  if (startKey === nextKey && clockMin < CALENDAR_OVERNIGHT_END_HOUR * 60) {
    return clockMin + 24 * 60;
  }
  return null;
}

/** Timed event belongs on this day's column grid (same day or overnight spill). */
export function isTimedOnDayGrid(d: Date, dayKey: string): boolean {
  const min = gridMinutesFromDate(dayKey, d);
  if (min == null) return false;
  return min >= CALENDAR_GRID_START_HOUR * 60 && min < CALENDAR_GRID_END_HOUR * 60;
}

/**
 * Keep a schedule instant inside the visible day grid for `dayKey`.
 * Early-morning clock times (00:00–06:00 same day) sit above the grid and were
 * dropped by layout after moving an overnight task onto that calendar day —
 * snap them to the default daytime slot instead.
 */
export function clampScheduleToDayGrid(dayKey: string, when: Date, now = new Date()): Date {
  if (isTimedOnDayGrid(when, dayKey)) return when;
  return buildDefaultScheduleDate(parseDayKey(dayKey), now);
}

export function startOfWeekMonday(d: Date, locale?: Locale): Date {
  return startOfLocaleWeek(d, locale);
}

export interface WeekDay {
  dayKey: string;
  date: Date;
}

export function buildWeekDays(weekStart: Date): WeekDay[] {
  const start = parseDayKey(toDayKey(weekStart));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { dayKey: toDayKey(date), date };
  });
}

export function weekRange(weekStart: Date): { start: Date; end: Date } {
  const start = parseDayKey(toDayKey(weekStart));
  return { start, end: addDays(start, 7) };
}

export function yearRange(year: number): { start: Date; end: Date } {
  return { start: new Date(year, 0, 1), end: new Date(year + 1, 0, 1) };
}

function taskEntry(task: TaskCard, start: Date): CalendarEntry {
  const mins = taskDurationMin(task);
  return {
    id: `task:${task.id}`,
    source: CalendarEntrySource.Task,
    title: displayTaskTitle(task.title, task.id),
    start,
    end: new Date(start.getTime() + mins * 60_000),
    allDay: false,
    taskId: task.id,
    taskStatus: task.status,
    epicId: task.epicId,
    epicColor: task.epicColor,
    googleEventId: task.googleEventId,
    googleCalendarId: task.googleCalendarId,
    conferenceUrl: task.conferenceUrl,
    conferenceProvider: task.conferenceProvider,
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
    if (!isVisibleTaskStatus(task.status)) return false;
    const key = task.scheduledStart ? taskDayKey(task) : todayKey;
    return key === dayKey;
  });

  const sorted = [...dayTasks].sort((a, b) => {
    const aDone = isTaskDone(a.status) ? 1 : 0;
    const bDone = isTaskDone(b.status) ? 1 : 0;
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
    const mins = taskDurationMin(task);
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

/** Planned blocks for a day grid, including overnight spill from the next morning. */
export function tasksPlannedForDayGrid(
  dayKey: string,
  tasks: TaskCard[],
  now = new Date(),
): PlannedTaskBlock[] {
  // 00:00–02:00 on this calendar day belong on yesterday's overnight spill —
  // keep them out of today's main list so they are not painted twice.
  const main = tasksPlannedForDay(dayKey, tasks, now).filter((block) => {
    if (toDayKey(block.start) !== dayKey) return true;
    const clockMin = block.start.getHours() * 60 + block.start.getMinutes();
    return clockMin >= CALENDAR_OVERNIGHT_END_HOUR * 60;
  });
  const nextKey = toDayKey(addDays(parseDayKey(dayKey), 1));
  const overnight = tasksPlannedForDay(nextKey, tasks, now).filter((block) => {
    const min = gridMinutesFromDate(dayKey, block.start);
    return min != null && min >= 24 * 60 && min < CALENDAR_GRID_END_HOUR * 60;
  });
  if (overnight.length === 0) return main;
  const seen = new Set(main.map((block) => block.task.id));
  return [...main, ...overnight.filter((block) => !seen.has(block.task.id))];
}

export function tasksToCalendarEntries(tasks: TaskCard[], now = new Date()): CalendarEntry[] {
  const todayKey = toDayKey(now);
  const visible = tasks.filter((task) => isVisibleTaskStatus(task.status));
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
  tasks: TaskCard[] = [],
): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const ev of events) {
    if (shouldHideGoogleEvent(ev, linkedGoogleIds, tasks)) continue;
    const start = googleEventDate(ev.start, ev.allDay, ev.id, 'start');
    const end = googleEventDate(ev.end, ev.allDay, ev.id, 'end');
    if (end <= start) {
      throw new Error(`Invalid Google Calendar event range: ${ev.id}`);
    }
    out.push({
      id: `google:${ev.id}`,
      source: CalendarEntrySource.Google,
      title: ev.title,
      start,
      end,
      allDay: ev.allDay,
      googleEventId: ev.id,
      googleCalendarId: ev.calendarId,
      googleEditable: ev.editable,
      googleHtmlLink: ev.htmlLink,
    });
  }
  return out;
}

function googleEventDate(
  value: string,
  allDay: boolean,
  eventId: string,
  field: 'start' | 'end',
): Date {
  try {
    return googleEventDisplayDate(value, allDay);
  } catch {
    throw new Error(`Invalid Google Calendar event ${field}: ${eventId}`);
  }
}

export function linkedGoogleEventIds(tasks: TaskCard[]): Set<string> {
  return new Set(tasks.map((task) => task.googleEventId).filter((id): id is string => Boolean(id)));
}

/** Nordly Meet twins that we must not paint beside the task block. */
function shouldHideGoogleEvent(
  ev: GoogleCalendarEvent,
  linkedGoogleIds: Set<string>,
  tasks: TaskCard[],
): boolean {
  if (linkedGoogleIds.has(ev.id)) return true;
  const evStart = new Date(ev.start).getTime();
  if (Number.isNaN(evStart)) return false;
  const evTitle = normalizeMeetingTitle(ev.title);
  for (const task of tasks) {
    if (
      task.conferenceProvider !== ConferenceProvider.Meet ||
      !task.conferenceUrl?.trim()
    ) {
      continue;
    }
    if (task.googleEventId === ev.id) return true;
    const start = taskScheduleStart(task);
    if (!start) continue;
    if (Math.abs(start.getTime() - evStart) > 60_000) continue;
    if (normalizeMeetingTitle(task.title) === evTitle) return true;
  }
  return false;
}

function normalizeMeetingTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function appleToCalendarEntries(events: AppleCalendarEvent[]): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const ev of events) {
    const start = parseScheduleInstant(ev.start);
    const end = parseScheduleInstant(ev.end);
    if (end <= start) {
      throw new Error(`Invalid Apple Calendar event range: ${ev.id}`);
    }
    out.push({
      id: `apple:${ev.id}`,
      source: CalendarEntrySource.Apple,
      title: ev.title,
      start,
      end,
      allDay: ev.allDay,
      appleEventId: ev.id,
      appleCalendarId: ev.calendarId,
    });
  }
  return out;
}

/**
 * Timed meetings that have not ended yet, sorted by start.
 * Google / Apple calendar events and Nordly tasks with a Meet/Zoom link.
 */
export function upcomingHomeMeetings(
  entries: CalendarEntry[],
  now = new Date(),
): CalendarEntry[] {
  const nowMs = now.getTime();
  return entries
    .filter((entry) => {
      if (entry.allDay || entry.end.getTime() <= nowMs) return false;
      if (
        entry.source === CalendarEntrySource.Google ||
        entry.source === CalendarEntrySource.Apple
      ) {
        return true;
      }
      return (
        entry.source === CalendarEntrySource.Task && Boolean(entry.conferenceUrl?.trim())
      );
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function mergeCalendarEntries(
  tasks: TaskCard[],
  googleEvents: GoogleCalendarEvent[],
  appleEvents: AppleCalendarEvent[] = [],
  now = new Date(),
): CalendarEntry[] {
  const taskEntries = tasksToCalendarEntries(tasks, now);
  const linked = linkedGoogleEventIds(tasks);
  const googleEntries = googleToCalendarEntries(googleEvents, linked, tasks);
  const appleEntries = appleToCalendarEntries(appleEvents);
  return [...taskEntries, ...googleEntries, ...appleEntries].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
}

/** Local midnight bounds for a day; calendar arithmetic keeps DST days at 23/25 hours. */
export function localDayRange(dayKey: string): { start: number; end: number } {
  const start = parseDayKey(dayKey);
  return { start: start.getTime(), end: addDays(start, 1).getTime() };
}

export function entriesForDay(entries: CalendarEntry[], dayKey: string): CalendarEntry[] {
  const { start, end } = localDayRange(dayKey);
  return entries.filter((entry) => entry.start.getTime() < end && entry.end.getTime() > start);
}

export function hasYearBusyEntry(entries: CalendarEntry[], dayKey: string): boolean {
  return entriesForDay(entries, dayKey).some(
    (entry) =>
      entry.source === CalendarEntrySource.Task ||
      entry.source === CalendarEntrySource.Google ||
      entry.source === CalendarEntrySource.Apple,
  );
}

/** Whether an all-day entry occupies a given calendar day (supports multi-day spans). */
export function allDayEntryOnDay(entry: CalendarEntry, dayKey: string): boolean {
  if (!entry.allDay) return false;
  const { start: dayStart, end: dayEnd } = localDayRange(dayKey);
  const evStart = parseDayKey(toDayKey(entry.start)).getTime();
  const evEnd = entry.end.getTime();
  return evStart < dayEnd && evEnd > dayStart;
}

export function allDayEntriesForDay(entries: CalendarEntry[], dayKey: string): CalendarEntry[] {
  return entries.filter((e) => allDayEntryOnDay(e, dayKey));
}

function timedEntryIntersectsDayGrid(
  entry: CalendarEntry,
  dayKey: string,
): boolean {
  const gridStart = dateFromGridMinutes(
    dayKey,
    CALENDAR_GRID_START_HOUR * 60,
  ).getTime();
  const gridEnd = dateFromGridMinutes(
    dayKey,
    CALENDAR_GRID_END_HOUR * 60,
  ).getTime();
  return entry.start.getTime() < gridEnd && entry.end.getTime() > gridStart;
}

export function timedEntriesForDay(entries: CalendarEntry[], dayKey: string): CalendarEntry[] {
  return entries.filter(
    (entry) => !entry.allDay && timedEntryIntersectsDayGrid(entry, dayKey),
  );
}

export function entriesForWeek(entries: CalendarEntry[], weekStart: Date): CalendarEntry[] {
  const days = buildWeekDays(weekStart);
  const weekStartMs = parseDayKey(days[0].dayKey).getTime();
  const weekEndMs = addDays(parseDayKey(days[6].dayKey), 1).getTime();

  return entries.filter((e) => {
    if (e.allDay) {
      const evStart = parseDayKey(toDayKey(e.start)).getTime();
      return evStart < weekEndMs && e.end.getTime() > weekStartMs;
    }
    return days.some(({ dayKey }) => timedEntryIntersectsDayGrid(e, dayKey));
  });
}

export function entriesForYear(entries: CalendarEntry[], year: number): CalendarEntry[] {
  const { start, end } = yearRange(year);
  const startMs = start.getTime();
  const endMs = end.getTime();
  return entries.filter((entry) => entry.start.getTime() < endMs && entry.end.getTime() > startMs);
}

export function eventBlockLayout(
  entry: CalendarEntry,
  hourHeight = CALENDAR_HOUR_HEIGHT_PX,
  gridStartHour = CALENDAR_GRID_START_HOUR,
  gridEndHour = CALENDAR_GRID_END_HOUR,
  gridDayKey?: string,
): { top: number; height: number } | null {
  if (entry.allDay) return null;

  const dayKey = gridDayKey ?? toDayKey(entry.start);
  const gridStart = dateFromGridMinutes(dayKey, gridStartHour * 60);
  const gridEnd = dateFromGridMinutes(dayKey, gridEndHour * 60);
  if (entry.start >= gridEnd || entry.end <= gridStart) return null;

  const clippedStart = entry.start < gridStart ? gridStart : entry.start;
  const clippedEnd = entry.end > gridEnd ? gridEnd : entry.end;
  const startMin = gridMinutesFromDate(dayKey, clippedStart);
  if (startMin == null) return null;
  const startH = startMin / 60;

  let endH: number;
  const endMin = gridMinutesFromDate(dayKey, clippedEnd);
  if (endMin != null && endMin > startMin) {
    endH = endMin / 60;
  } else {
    endH =
      startH +
      Math.max(0.5, (clippedEnd.getTime() - clippedStart.getTime()) / 3_600_000);
  }

  const gridSpan = gridEndHour - gridStartHour;
  const maxTop = gridSpan * hourHeight;
  let top = (startH - gridStartHour) * hourHeight;
  // True duration height — no large floor (that blocked ~30m blocks on compressed grids).
  let height = Math.max((endH - startH) * hourHeight, 12);

  if (top < 0) {
    height += top;
    top = 0;
  }
  if (height <= 0) {
    return null;
  }
  if (top >= maxTop) {
    top = Math.max(0, maxTop - 12);
    height = 12;
  } else if (top + height > maxTop) {
    height = Math.max(12, maxTop - top);
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

/** Explicit left/width so overlapping columns work in WKWebView (CSS vars in calc are flaky). */
export function calendarColumnStyle(
  column: number,
  columnCount: number,
): { left: string; width: string } {
  const cols = Math.max(1, columnCount);
  const col = Math.max(0, Math.min(column, cols - 1));
  const edge = 4;
  const gap = 2;
  const inner = `100% - ${edge * 2}px - ${(cols - 1) * gap}px`;
  return {
    width: `calc((${inner}) / ${cols})`,
    left: `calc(${edge}px + ${col} * (((${inner}) / ${cols}) + ${gap}px))`,
  };
}

function entryTimeRangeMs(entry: CalendarEntry): { start: number; end: number } {
  const start = entry.start.getTime();
  let end = entry.end.getTime();
  if (end <= start) end = start + TASK_DURATION_DEFAULT * 60_000;
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
  gridStartHour = CALENDAR_GRID_START_HOUR,
  gridEndHour = CALENDAR_GRID_END_HOUR,
  gridDayKey?: string,
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
      const block = eventBlockLayout(
        entry,
        hourHeight,
        gridStartHour,
        gridEndHour,
        gridDayKey ?? toDayKey(entry.start),
      );
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
