import { type Locale } from '@nordly-i18n';
import { formatLocaleDate, formatLocaleTime } from '@shared/lib/localeFormat';
import { TASK_DURATION_MIN, taskDurationMin } from '@shared/lib/taskDuration';

const DAY_MS = 24 * 60 * 60 * 1000;

export function requireValidDate(date: Date, context: string): Date {
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${context}`);
  }
  return date;
}

export interface DayKey {
  /** YYYY-MM-DD in local timezone */
  key: string;
  date: Date;
}

export function startOfLocalDay(d: Date): Date {
  requireValidDate(d, 'date');
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toDayKey(d: Date): string {
  requireValidDate(d, 'date');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDayKey(key: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) throw new Error(`Invalid day key: ${key}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    throw new Error(`Invalid day key: ${key}`);
  }
  return parsed;
}

export function parseOptionalDate(
  value: string | null | undefined,
  context: string,
): Date | null {
  if (value == null || value === '') return null;
  return requireValidDate(new Date(value), context);
}

export function addDays(base: Date, offset: number): Date {
  const d = startOfLocalDay(base);
  d.setDate(d.getDate() + offset);
  return d;
}

export function differenceInCalendarDays(
  target: Date,
  anchor: Date,
): number {
  requireValidDate(target, 'target date');
  requireValidDate(anchor, 'anchor date');
  const targetDay = Date.UTC(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );
  const anchorDay = Date.UTC(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
  );
  return Math.round((targetDay - anchorDay) / DAY_MS);
}

/** Window of days centered on today (inclusive). */
export function buildDayWindow(center: Date, before: number, after: number): DayKey[] {
  const out: DayKey[] = [];
  for (let i = -before; i <= after; i++) {
    const date = addDays(center, i);
    out.push({ key: toDayKey(date), date });
  }
  return out;
}

export function formatWhenChip(date: Date, locale?: Locale): string {
  return formatLocaleDate(date, locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatColumnHeader(
  date: Date,
  today: Date,
  locale?: Locale,
): { weekday: string; label: string; isToday: boolean } {
  const isToday = toDayKey(date) === toDayKey(today);
  const weekday = formatLocaleDate(date, locale, { weekday: 'long' });
  const label = formatLocaleDate(date, locale, { month: 'short', day: 'numeric' });
  return { weekday, label, isToday };
}

export function formatTimelineHeader(date: Date, locale?: Locale): string {
  return formatLocaleDate(date, locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function formatWeekdayShort(iso: string, locale?: Locale): string {
  const d = parseDayKey(iso);
  return formatLocaleDate(d, locale, { weekday: 'short' });
}

export function taskDayKey(task: { scheduledStart?: string; createdAt: string }): string {
  if (task.scheduledStart) {
    try {
      return toDayKey(parseScheduleInstant(task.scheduledStart));
    } catch (error) {
      throw new Error(`Invalid task schedule: ${task.scheduledStart}`, {
        cause: error,
      });
    }
  }
  const created = new Date(task.createdAt);
  if (Number.isNaN(created.getTime())) {
    throw new Error(`Invalid task createdAt: ${task.createdAt}`);
  }
  return toDayKey(created);
}

export function formatDuration(totalMin: number): string {
  if (totalMin <= 0) return '0m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Compact label for task row / duration menu (30m, 1h, 2h). */
export const formatDurationShort = formatDuration;

/** Snap a minutes-of-day value to the nearest step (default 5 min). Calendar grids pass 30. */
export function snapMinutes(totalMin: number, step = 5): number {
  return Math.round(totalMin / step) * step;
}

export function roundToNearestMin(d: Date, step = 5): Date {
  const out = new Date(d);
  out.setMinutes(Math.round(out.getMinutes() / step) * step, 0, 0);
  return out;
}

/** Default start for scheduling on a day: now (rounded) for today, 9:00 for other days. */
export function buildDefaultScheduleDate(day: Date, now = new Date()): Date {
  const dayKey = toDayKey(day);
  const out = startOfLocalDay(day);
  if (dayKey === toDayKey(now)) {
    out.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
    return roundToNearestMin(out);
  }
  out.setHours(9, 0, 0, 0);
  return out;
}

/** Final schedule instant when creating a task from the palette. */
export function buildCreateScheduleDate(
  targetDay: Date,
  chosen: Date,
  timeCustomized: boolean,
  now = new Date(),
): Date {
  const day = startOfLocalDay(targetDay);
  if (timeCustomized) {
    return applyTimeFromDay(day, chosen);
  }
  return buildDefaultScheduleDate(day, now);
}

/** RFC3339 with explicit local UTC offset (wall clock the user sees). Prefer for schedules. */
export function toLocalISO(d: Date): string {
  requireValidDate(d, 'schedule date');
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const min = pad(d.getMinutes());
  const sec = pad(d.getSeconds());
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const oh = pad(Math.floor(Math.abs(offsetMin) / 60));
  const om = pad(Math.abs(offsetMin) % 60);
  return `${y}-${m}-${day}T${h}:${min}:${sec}${sign}${oh}:${om}`;
}

/**
 * Serialize a schedule instant for storage / API.
 * Always local wall + offset (never Zulu wall-stamp).
 */
export function scheduleStartISO(start: Date | string): string {
  if (typeof start === 'string') {
    return toLocalISO(parseScheduleInstant(start));
  }
  if (Number.isNaN(start.getTime())) {
    throw new Error('Invalid schedule date');
  }
  return toLocalISO(start);
}

/**
 * Parse a stored schedule ISO into a Date.
 * Offset / Zulu → absolute instant. Bare `YYYY-MM-DDTHH:mm[:ss]` → local wall clock.
 */
export function parseScheduleInstant(iso: string): Date {
  const trimmed = iso.trim();
  const local = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/,
  );
  if (local) {
    const year = Number(local[1]);
    const month = Number(local[2]);
    const day = Number(local[3]);
    const hours = Number(local[4] ?? 0);
    const minutes = Number(local[5] ?? 0);
    const seconds = Number(local[6] ?? 0);
    const milliseconds = Number((local[7] ?? '').padEnd(3, '0') || 0);
    const parsed = new Date(
      year,
      month - 1,
      day,
      hours,
      minutes,
      seconds,
      milliseconds,
    );
    if (
      parsed.getFullYear() === year &&
      parsed.getMonth() === month - 1 &&
      parsed.getDate() === day &&
      parsed.getHours() === hours &&
      parsed.getMinutes() === minutes &&
      parsed.getSeconds() === seconds &&
      parsed.getMilliseconds() === milliseconds
    ) {
      return parsed;
    }
    throw new Error(`Invalid schedule instant: ${iso}`);
  }

  const zoned =
    /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i.exec(
      trimmed,
    );
  if (!zoned) throw new Error(`Invalid schedule instant: ${iso}`);
  try {
    parseDayKey(zoned[1]!);
  } catch (error) {
    throw new Error(`Invalid schedule instant: ${iso}`, { cause: error });
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid schedule instant: ${iso}`);
  }
  return parsed;
}

export function applyTimeToDay(day: Date, hours: number, minutes: number): Date {
  const out = startOfLocalDay(day);
  out.setHours(hours, minutes, 0, 0);
  return out;
}

/** Keep time-of-day from `source`, move to `targetDay` (local). */
export function applyTimeFromDay(targetDay: Date, source: Date): Date {
  return applyTimeToDay(targetDay, source.getHours(), source.getMinutes());
}

export function formatTimeShort(d: Date, locale?: Locale): string {
  return formatLocaleTime(d, locale);
}

export function formatWhenChipWithTime(date: Date, locale?: Locale): string {
  return `${formatLocaleDate(date, locale, { weekday: 'short' })} · ${formatTimeShort(date, locale)}`;
}

export function taskScheduleStart(task: { scheduledStart?: string }): Date | null {
  if (!task.scheduledStart) return null;
  try {
    return parseScheduleInstant(task.scheduledStart);
  } catch (error) {
    throw new Error(`Invalid task schedule: ${task.scheduledStart}`, {
      cause: error,
    });
  }
}

interface ScheduledBlock {
  startMs: number;
  endMs: number;
}

/** Nudge start forward until it no longer overlaps existing blocks on the same day. */
export function resolveScheduleStart(
  dayKey: string,
  tasks: Array<{ id?: string; scheduledStart?: string; scheduledDurationMin?: number }>,
  preferred: Date,
  excludeTaskId?: string,
): Date {
  const blocks: ScheduledBlock[] = tasks
    .filter((t) => {
      if (t.id === excludeTaskId || !t.scheduledStart) return false;
      const d = parseScheduleInstant(t.scheduledStart);
      return toDayKey(d) === dayKey;
    })
    .map((t) => {
      const start = parseScheduleInstant(t.scheduledStart!);
      const dur = taskDurationMin(t);
      return {
        startMs: start.getTime(),
        endMs: start.getTime() + dur * 60_000,
      };
    })
    .sort((a, b) => a.startMs - b.startMs);

  // Never nudge onto the next calendar day — that made late-evening creates
  // (e.g. 22:30 with a full afternoon) jump to tomorrow's column.
  const dayEnd = startOfLocalDay(parseDayKey(dayKey));
  dayEnd.setDate(dayEnd.getDate() + 1);

  let candidate = new Date(preferred);
  for (let i = 0; i < 48; i++) {
    if (candidate.getTime() >= dayEnd.getTime()) return preferred;
    const candEnd = candidate.getTime() + taskDurationMin({}) * 60_000;
    const conflict = blocks.some((b) => candidate.getTime() < b.endMs && candEnd > b.startMs);
    if (!conflict) return candidate;
    candidate = new Date(candidate.getTime() + TASK_DURATION_MIN * 60_000);
  }
  return preferred;
}

export { DAY_MS };
