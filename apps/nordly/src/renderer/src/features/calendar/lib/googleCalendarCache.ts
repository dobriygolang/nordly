import {
  GoogleReauthError,
  listGoogleCalendarEvents,
  type GoogleCalendarEvent,
} from '@features/calendar/remote/calendarClient';
import {
  calendarStoreClear,
  calendarStoreLoadSnapshot,
  calendarStoreSaveSnapshot,
} from '@features/calendar/repository/calendarStore';
import { startOfWeekMonday } from '@features/calendar/lib/events';
import { googleCalendarPollIntervalMs } from '@shared/model/settings';

/** Background worker refetches after this age (from app settings). */
export function getGoogleCalendarFreshMs(): number {
  return googleCalendarPollIntervalMs();
}

/**
 * Soft hint for when UI should prefer a network refresh while online.
 * Display still shows persisted events indefinitely when offline.
 */
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
let hydratePromise: Promise<void> | null = null;

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

function persistSnapshot(): void {
  if (!snapshot) return;
  void calendarStoreSaveSnapshot(
    snapshot.events,
    new Date(snapshot.timeMin),
    new Date(snapshot.timeMax),
  ).catch((err: unknown) => {
    console.warn('[googleCalendarCache] persist failed:', err);
  });
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
  persistSnapshot();
  notifyListeners();
}

export function isGoogleCalendarSnapshotFresh(now = Date.now()): boolean {
  if (!snapshot) return false;
  return now - snapshot.fetchedAt <= googleCalendarPollIntervalMs();
}

/** Load last snapshot from IndexedDB into memory (idempotent). */
export function hydrateGoogleCalendarCache(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const row = await calendarStoreLoadSnapshot();
      if (!row || snapshot) return;
      snapshot = {
        timeMin: row.timeMin,
        timeMax: row.timeMax,
        events: row.events,
        fetchedAt: row.fetchedAt,
      };
      notifyListeners();
    } catch (err) {
      console.warn('[googleCalendarCache] hydrate failed:', err);
    }
  })();
  return hydratePromise;
}

/** Read cached events for a range — shows last-known data with no display expiry. */
export function peekGoogleCalendarEvents(timeMin: Date, timeMax: Date): GoogleCalendarEvent[] | null {
  const min = timeMin.getTime();
  const max = timeMax.getTime();

  if (snapshot && min >= snapshot.timeMin && max <= snapshot.timeMax) {
    return filterEventsInRange(snapshot.events, timeMin, timeMax);
  }

  const hit = rangeCache.get(googleRangeKey(timeMin, timeMax));
  return hit?.events ?? null;
}

export function prefetchGoogleCalendarEvents(timeMin: Date, timeMax: Date): Promise<GoogleCalendarEvent[]> {
  return fetchGoogleCalendarEvents(timeMin, timeMax, { force: false });
}

export async function fetchGoogleCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  opts: { force?: boolean } = {},
): Promise<GoogleCalendarEvent[]> {
  await hydrateGoogleCalendarCache();
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
      // Keep prior cache on failure so offline / blips do not wipe the UI.
      if (existing) {
        rangeCache.set(key, { events: existing.events, fetchedAt: existing.fetchedAt });
      } else {
        rangeCache.delete(key);
      }
      throw err;
    });

  if (existing) {
    rangeCache.set(key, { ...existing, promise });
  }

  return promise;
}

export async function syncGoogleCalendarSnapshot(
  timeMin: Date,
  timeMax: Date,
  opts: { force?: boolean } = {},
): Promise<GoogleCalendarEvent[]> {
  await hydrateGoogleCalendarCache();
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
  hydratePromise = null;
  void calendarStoreClear().catch((err: unknown) => {
    console.warn('[googleCalendarCache] clear failed:', err);
  });
  notifyListeners();
}

export { GoogleReauthError };
