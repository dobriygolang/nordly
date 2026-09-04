import {
  listAppleCalendarEvents,
  type AppleCalendarEvent,
} from '@features/calendar/api/appleCalendarClient';
import {
  CalendarProvider,
  CalendarProviderErrorKind,
  calendarProviderError,
  type CalendarProviderError,
} from '@features/calendar/model/provider';
import { isMacOsDesktop } from '@platform/macos';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { appleCalendarPollIntervalMs, readSettings } from '@shared/model/settings';

export interface AppleCalendarSlice {
  events: AppleCalendarEvent[];
  loading: boolean;
  error: CalendarProviderError | null;
}

interface Watch {
  timeMin: Date;
  timeMax: Date;
  enabled: boolean;
  refs: number;
}

const EMPTY_SLICE: AppleCalendarSlice = { events: [], loading: false, error: null };

const slices = new Map<string, AppleCalendarSlice>();
const inFlight = new Map<string, Promise<AppleCalendarEvent[]>>();
const sliceGenerations = new Map<string, number>();
const watches = new Map<string, Watch>();
const listeners = new Set<() => void>();

let authFetchBlocked = false;
let runtimeStarted = false;
let pollId: number | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function watchKey(timeMin: Date, timeMax: Date): string {
  return `${timeMin.toISOString()}|${timeMax.toISOString()}`;
}

export function appleCalendarFetchKey(timeMin: Date, timeMax: Date): string {
  return `${watchKey(timeMin, timeMax)}|${readSettings().appleCalendarIds.join(',')}`;
}

function isAuthFetchError(err: unknown): boolean {
  const message =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message ?? '')
          : '';
  return /access not granted|access denied|write-only|restricted|unavailable/i.test(message);
}

function writeSlice(key: string, next: AppleCalendarSlice): void {
  const prev = slices.get(key);
  if (
    prev &&
    prev.events === next.events &&
    prev.loading === next.loading &&
    prev.error?.kind === next.error?.kind &&
    prev.error?.message === next.error?.message
  ) {
    return;
  }
  slices.set(key, next);
  notify();
}

export function getAppleCalendarSlice(key: string): AppleCalendarSlice {
  return slices.get(key) ?? EMPTY_SLICE;
}

async function loadRange(timeMin: Date, timeMax: Date, enabled: boolean): Promise<void> {
  const key = appleCalendarFetchKey(timeMin, timeMax);
  const generation = (sliceGenerations.get(key) ?? 0) + 1;
  sliceGenerations.set(key, generation);
  if (!enabled || !isMacOsDesktop() || authFetchBlocked || !readSettings().appleCalendarEnabled) {
    writeSlice(key, EMPTY_SLICE);
    return;
  }

  const ids = readSettings().appleCalendarIds;
  const prev = slices.get(key);
  writeSlice(key, {
    events: prev?.events ?? [],
    loading: true,
    error: prev?.error ?? null,
  });

  try {
    let pending = inFlight.get(key);
    if (!pending) {
      pending = listAppleCalendarEvents(timeMin, timeMax, ids);
      inFlight.set(key, pending);
      const clear = () => {
        if (inFlight.get(key) === pending) inFlight.delete(key);
      };
      void pending.then(clear, clear);
    }
    const next = await pending;
    if (sliceGenerations.get(key) !== generation) return;
    writeSlice(key, { events: next, loading: false, error: null });
  } catch (err) {
    if (sliceGenerations.get(key) !== generation) return;
    const permissionError = isAuthFetchError(err);
    if (permissionError) {
      authFetchBlocked = true;
      stopPoll();
    }
    console.error('[appleCalendar] fetch failed', err);
    const kept = slices.get(key);
    writeSlice(key, {
      events: kept?.events ?? [],
      loading: false,
      error: calendarProviderError(
        CalendarProvider.Apple,
        permissionError
          ? CalendarProviderErrorKind.Permission
          : CalendarProviderErrorKind.Fetch,
        err,
      ),
    });
  }
}

function stopPoll(): void {
  if (pollId === null) return;
  window.clearInterval(pollId);
  pollId = null;
}

function ensurePoll(): void {
  if (pollId !== null) return;
  if (listeners.size === 0) return;
  if (!isMacOsDesktop() || !readSettings().appleCalendarEnabled || authFetchBlocked) return;
  pollId = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    for (const watch of watches.values()) {
      void loadRange(watch.timeMin, watch.timeMax, watch.enabled);
    }
  }, appleCalendarPollIntervalMs());
}

function restartPoll(): void {
  stopPoll();
  ensurePoll();
}

function onSettings(): void {
  authFetchBlocked = false;
  inFlight.clear();
  const settingsOn = readSettings().appleCalendarEnabled;
  restartPoll();
  for (const watch of watches.values()) {
    watch.enabled = settingsOn;
    void loadRange(watch.timeMin, watch.timeMax, settingsOn);
  }
}

function ensureRuntime(): void {
  if (!runtimeStarted) {
    runtimeStarted = true;
    window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettings);
  }
  ensurePoll();
}

export function subscribeAppleCalendarEvents(listener: () => void): () => void {
  listeners.add(listener);
  ensureRuntime();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopPoll();
  };
}

export function watchAppleCalendarRange(
  timeMin: Date,
  timeMax: Date,
  enabled: boolean,
): () => void {
  const key = watchKey(timeMin, timeMax);
  const existing = watches.get(key);
  if (existing) {
    existing.refs += 1;
    existing.enabled = enabled;
    existing.timeMin = timeMin;
    existing.timeMax = timeMax;
  } else {
    watches.set(key, { timeMin, timeMax, enabled, refs: 1 });
  }
  void loadRange(timeMin, timeMax, enabled);
  return () => {
    const watch = watches.get(key);
    if (!watch) return;
    watch.refs -= 1;
    if (watch.refs <= 0) watches.delete(key);
  };
}

export function resetAppleCalendarFetchBlock(): void {
  authFetchBlocked = false;
  inFlight.clear();
}

export function refreshAppleCalendarRange(timeMin: Date, timeMax: Date): Promise<void> {
  resetAppleCalendarFetchBlock();
  return loadRange(timeMin, timeMax, true);
}
