import {
  GoogleReauthError,
  listGoogleCalendarEvents,
  type GoogleCalendarEvent,
} from '@features/calendar/api/calendarClient';
import { startOfWeekMonday } from '@features/calendar/lib/events';
import { googleCalendarPollIntervalMs } from '@pages/Settings/lib/settings-store';

/** Background worker refetches after this age (from app settings). */
export function getGoogleCalendarFreshMs(): number {
  return googleCalendarPollIntervalMs();
}
/** UI may show cached data up to this age without blocking. */
export const GOOGLE_CALENDAR_STALE_MS = 24 * 60 * 60_000;

interface Snapshot {
  timeMin: number;
  timeMax: number;
  events: GoogleCalendarEvent[];
  fetchedAt: number;
}

interface RangeEntry {
  events: GoogleCalendarEvent[];
  fetchedAt: number;
  promise?: Promise<GoogleCalendarEvent[]>;
}

let snapshot: Snapshot | null = null;
const rangeCache = new Map<string, RangeEntry>();
const listeners = new Set<() => void>();

export function googleRangeKey(timeMin: Date, timeMax: Date): string {
  return `${timeMin.toISOString()}|${timeMax.toISOString()}`;
}

/** Default window synced by the background worker (~3 months rolling). */
export function defaultGoogleSyncWindow(now = new Date()): { timeMin: Date; timeMax: Date } {
  const weekStart = startOfWeekMonday(now);
  const timeMin = new Date(weekStart);
  timeMin.setDate(timeMin.getDate() - 45);
  const timeMax = new Date(weekStart);
  timeMax.setDate(timeMax.getDate() + 75);
  return { timeMin, timeMax };
}

function filterEventsInRange(
  events: GoogleCalendarEvent[],
  timeMin: Date,
  timeMax: Date,
): GoogleCalendarEvent[] {
  const min = timeMin.getTime();
  const max = timeMax.getTime();
  return events.filter((ev) => {
    const start = new Date(ev.start).getTime();
    if (Number.isNaN(start)) return false;
    const end = ev.end ? new Date(ev.end).getTime() : start + 3_600_000;
    return start < max && end > min;
  });
}

function notifyListeners(): void {
  for (const fn of listeners) fn();
}

export function subscribeGoogleCalendarCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setGoogleCalendarSnapshot(
  events: GoogleCalendarEvent[],
  timeMin: Date,
  timeMax: Date,
): void {
  snapshot = {
    timeMin: timeMin.getTime(),
    timeMax: timeMax.getTime(),
    events,
    fetchedAt: Date.now(),
  };
  notifyListeners();
}

export function isGoogleCalendarSnapshotFresh(now = Date.now()): boolean {
  if (!snapshot) return false;
  return now - snapshot.fetchedAt <= googleCalendarPollIntervalMs();
}

function readRangeEntry(key: string, maxAgeMs: number): GoogleCalendarEvent[] | null {
  const hit = rangeCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.fetchedAt > maxAgeMs) return null;
  return hit.events;
}

/** Read cached events for a range (snapshot or exact-range fallback). */
export function peekGoogleCalendarEvents(timeMin: Date, timeMax: Date): GoogleCalendarEvent[] | null {
  const min = timeMin.getTime();
  const max = timeMax.getTime();

  if (snapshot && min >= snapshot.timeMin && max <= snapshot.timeMax) {
    if (Date.now() - snapshot.fetchedAt > GOOGLE_CALENDAR_STALE_MS) return null;
    return filterEventsInRange(snapshot.events, timeMin, timeMax);
  }

  return readRangeEntry(googleRangeKey(timeMin, timeMax), GOOGLE_CALENDAR_STALE_MS);
}

export function prefetchGoogleCalendarEvents(timeMin: Date, timeMax: Date): Promise<GoogleCalendarEvent[]> {
  return fetchGoogleCalendarEvents(timeMin, timeMax, { force: false });
}

export async function fetchGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  opts: { force?: boolean } = {},
): Promise<GoogleCalendarEvent[]> {
  const key = googleRangeKey(timeMin, timeMax);
  if (!opts.force) {
    const cached = peekGoogleCalendarEvents(timeMin, timeMax);
    if (cached) return cached;
  }

  const existing = rangeCache.get(key);
  if (existing?.promise && !opts.force) return existing.promise;

  const promise = listGoogleCalendarEvents(timeMin, timeMax)
    .then((events) => {
      rangeCache.set(key, { events, fetchedAt: Date.now() });
      notifyListeners();
      return events;
    })
    .catch((err) => {
      rangeCache.delete(key);
      throw err;
    });

  rangeCache.set(key, {
    events: existing?.events ?? [],
    fetchedAt: existing?.fetchedAt ?? 0,
    promise,
  });

  return promise;
}

export async function syncGoogleCalendarSnapshot(
  timeMin: Date,
  timeMax: Date,
  opts: { force?: boolean } = {},
): Promise<GoogleCalendarEvent[]> {
  if (!opts.force && isGoogleCalendarSnapshotFresh()) {
    return snapshot!.events;
  }

  const events = await listGoogleCalendarEvents(timeMin, timeMax);
  setGoogleCalendarSnapshot(events, timeMin, timeMax);
  rangeCache.set(googleRangeKey(timeMin, timeMax), { events, fetchedAt: Date.now() });
  return events;
}

export function invalidateGoogleCalendarCache(): void {
  snapshot = null;
  rangeCache.clear();
  notifyListeners();
}

export { GoogleReauthError };
