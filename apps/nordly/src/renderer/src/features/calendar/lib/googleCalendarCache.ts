import {
  GoogleNotConnectedError,
  GoogleReauthError,
  listGoogleCalendarEvents,
  type GoogleCalendarEvent,
} from '@features/calendar/api/calendarClient';
import {
  CalendarProvider,
  CalendarProviderErrorKind,
  calendarProviderError,
  type CalendarProviderError,
} from '@features/calendar/model/provider';
import { googleEventDisplayDate } from '@features/calendar/model/calendar';
import {
  calendarStoreClear,
  calendarStoreLoadSnapshot,
  calendarStoreSaveSnapshot,
} from '@features/calendar/repository/calendarStore';
import { startOfWeekMonday } from '@features/calendar/lib/events';
import { requireUserId } from '@shared/db/nordlyDb';
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
let lastError: CalendarProviderError | null = null;

export function googleCalendarLastError(): CalendarProviderError | null {
  return lastError;
}

function setLastError(error: CalendarProviderError | null): void {
  lastError = error;
}

export function googleCalendarProviderError(error: unknown): CalendarProviderError {
  const kind =
    error instanceof GoogleReauthError
      ? CalendarProviderErrorKind.Reauth
      : error instanceof GoogleNotConnectedError
        ? CalendarProviderErrorKind.NotConnected
        : CalendarProviderErrorKind.Fetch;
  return calendarProviderError(CalendarProvider.Google, kind, error);
}

export function reportGoogleCalendarError(err: unknown): void {
  setLastError(googleCalendarProviderError(err));
  notifyListeners();
}

let hydratePromise: Promise<void> | null = null;
/** Bumped on invalidate so late hydrates cannot resurrect a cleared cache. */
let cacheGeneration = 0;
/** Per-range seq so force refetches cannot be clobbered by an older in-flight promise. */
const rangeFetchSeq = new Map<string, number>();

export function googleRangeKey(timeMin: Date, timeMax: Date): string {
  return `${timeMin.toISOString()}|${timeMax.toISOString()}`;
}

export function isInsideDefaultGoogleSyncWindow(timeMin: Date, timeMax: Date, now = new Date()): boolean {
  const win = defaultGoogleSyncWindow(now);
  return timeMin.getTime() >= win.timeMin.getTime() && timeMax.getTime() <= win.timeMax.getTime();
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
    const start = googleEventDisplayDate(ev.start, ev.allDay).getTime();
    const end = googleEventDisplayDate(ev.end, ev.allDay).getTime();
    if (end <= start) {
      throw new Error(`Invalid Google Calendar event range: ${ev.id}`);
    }
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

function persistSnapshot(gen: number): void {
  if (!snapshot) return;
  const snap = snapshot;
  const uid = requireUserId();
  void (async () => {
    if (gen !== cacheGeneration) return;
    await calendarStoreSaveSnapshot(
      snap.events,
      new Date(snap.timeMin),
      new Date(snap.timeMax),
      uid,
    );
    // User switch / invalidate raced the write — drop the resurrected snapshot.
    if (gen !== cacheGeneration) {
      await calendarStoreClear(uid);
    }
  })().catch((err: unknown) => {
    setLastError(googleCalendarProviderError(err));
    notifyListeners();
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
  setLastError(null);
  persistSnapshot(cacheGeneration);
  notifyListeners();
}

export function isGoogleCalendarSnapshotFresh(now = Date.now()): boolean {
  if (!snapshot) return false;
  return now - snapshot.fetchedAt <= googleCalendarPollIntervalMs();
}

/** True when display cache for this range needs a network refresh while online. */
export function isGoogleCalendarRangeStale(
  timeMin: Date,
  timeMax: Date,
  now = Date.now(),
): boolean {
  const min = timeMin.getTime();
  const max = timeMax.getTime();
  if (snapshot && min >= snapshot.timeMin && max <= snapshot.timeMax) {
    return now - snapshot.fetchedAt > GOOGLE_CALENDAR_STALE_MS;
  }
  const hit = rangeCache.get(googleRangeKey(timeMin, timeMax));
  if (!hit || hit.fetchedAt === 0) return true;
  return now - hit.fetchedAt > GOOGLE_CALENDAR_STALE_MS;
}

/** Load last snapshot from IndexedDB into memory (idempotent). */
export function hydrateGoogleCalendarCache(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  const gen = cacheGeneration;
  hydratePromise = (async () => {
    try {
      const row = await calendarStoreLoadSnapshot();
      if (gen !== cacheGeneration) return;
      if (!row || snapshot) return;
      snapshot = {
        timeMin: row.timeMin,
        timeMax: row.timeMax,
        events: row.events,
        fetchedAt: row.fetchedAt,
      };
      setLastError(null);
      notifyListeners();
    } catch (err) {
      setLastError(googleCalendarProviderError(err));
      notifyListeners();
    }
  })();
  return hydratePromise;
}

/** Read cached events for a range — shows last-known data with no display expiry. */
export function peekGoogleCalendarEvents(timeMin: Date, timeMax: Date): GoogleCalendarEvent[] | null {
  const min = timeMin.getTime();
  const max = timeMax.getTime();
  const key = googleRangeKey(timeMin, timeMax);
  const hit = rangeCache.get(key);

  if (snapshot && min >= snapshot.timeMin && max <= snapshot.timeMax) {
    // Prefer a fresher exact-range fetch (force refresh) over the snapshot filter.
    if (hit && hit.fetchedAt >= snapshot.fetchedAt) {
      return hit.events;
    }
    return filterEventsInRange(snapshot.events, timeMin, timeMax);
  }

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

  const gen = cacheGeneration;
  const seq = (rangeFetchSeq.get(key) ?? 0) + 1;
  rangeFetchSeq.set(key, seq);
  const promise = listGoogleCalendarEvents(timeMin, timeMax)
    .then((events) => {
      if (gen !== cacheGeneration || rangeFetchSeq.get(key) !== seq) return events;
      rangeCache.set(key, { events, fetchedAt: Date.now() });
      setLastError(null);
      notifyListeners();
      return events;
    })
    .catch((err) => {
      // Keep prior cache on failure so offline / blips do not wipe the UI.
      if (gen !== cacheGeneration || rangeFetchSeq.get(key) !== seq) throw err;
      if (existing) {
        rangeCache.set(key, { events: existing.events, fetchedAt: existing.fetchedAt });
      } else {
        rangeCache.delete(key);
      }
      throw err;
    });

  if (existing) {
    rangeCache.set(key, { ...existing, promise });
  } else {
    rangeCache.set(key, { events: [], fetchedAt: 0, promise });
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

  const gen = cacheGeneration;
  const events = await listGoogleCalendarEvents(timeMin, timeMax);
  if (gen !== cacheGeneration) {
    // Invalidated while fetching — return the fresh network result, never a stale snapshot.
    return events;
  }
  setGoogleCalendarSnapshot(events, timeMin, timeMax);
  rangeCache.set(googleRangeKey(timeMin, timeMax), { events, fetchedAt: Date.now() });
  return events;
}

export function invalidateGoogleCalendarCache(persistUserId?: string): void {
  cacheGeneration += 1;
  snapshot = null;
  rangeCache.clear();
  rangeFetchSeq.clear();
  hydratePromise = null;
  void calendarStoreClear(persistUserId)
    .then(() => {
      setLastError(null);
      notifyListeners();
    })
    .catch((err: unknown) => {
      setLastError(googleCalendarProviderError(err));
      notifyListeners();
    });
  notifyListeners();
}

export { GoogleNotConnectedError, GoogleReauthError };
