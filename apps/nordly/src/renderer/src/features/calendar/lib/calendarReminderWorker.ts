import { translate } from '@nordly-i18n';

import type { GoogleCalendarEvent } from '@features/calendar/api/calendarClient';
import { readSettings } from '@shared/model/settings';
import { notify } from '@shared/api/notifications';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

import {
  defaultGoogleSyncWindow,
  peekGoogleCalendarEvents,
  subscribeGoogleCalendarCache,
} from './googleCalendarCache';

const CHECK_INTERVAL_MS = 30_000;
const LOOK_BACK_MS = 45_000;
const LOOK_AHEAD_MS = 15_000;
const SEEN_MAX = 400;

let started = false;
let intervalId: number | null = null;
let checking = false;
let unsubscribeCache: (() => void) | null = null;
const seen = new Set<string>();

function remindersEnabled(): boolean {
  const settings = readSettings();
  return settings.notifications && settings.calendarNotifications;
}

function trimSeen(): void {
  if (seen.size <= SEEN_MAX) return;
  const drop = seen.size - SEEN_MAX;
  let i = 0;
  for (const key of seen) {
    seen.delete(key);
    i += 1;
    if (i >= drop) break;
  }
}

function isDue(start: Date, now = Date.now()): boolean {
  const t = start.getTime();
  if (!Number.isFinite(t)) return false;
  return t >= now - LOOK_BACK_MS && t <= now + LOOK_AHEAD_MS;
}

function formatReminderTime(start: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
}

async function emitReminder(id: string, title: string, start: Date): Promise<void> {
  const key = `google:${id}:${start.toISOString()}`;
  if (seen.has(key)) return;
  seen.add(key);
  trimSeen();

  await notify(
    translate('nordly.calendar.reminder.google_title'),
    translate('nordly.calendar.reminder.body', {
      title: title || translate('nordly.calendar.title'),
      time: formatReminderTime(start),
    }),
    { sound: 'calendar' },
  );
}

async function checkGoogleEvents(now = Date.now()): Promise<void> {
  const { timeMin, timeMax } = defaultGoogleSyncWindow(new Date(now));
  const events = peekGoogleCalendarEvents(timeMin, timeMax);
  if (!events) return;

  await Promise.all(
    events.map(async (event: GoogleCalendarEvent) => {
      if (event.allDay) return;
      const start = new Date(event.start);
      if (!isDue(start, now)) return;
      await emitReminder(`${event.calendarId}:${event.id}`, event.title, start);
    }),
  );
}

async function runCheck(): Promise<void> {
  if (checking || !remindersEnabled()) return;
  checking = true;
  const now = Date.now();
  try {
    await checkGoogleEvents(now);
  } catch (err) {
    console.error('[nordly:calendar-reminder]', err);
  } finally {
    checking = false;
  }
}

function schedule(): void {
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = window.setInterval(() => {
    void runCheck();
  }, CHECK_INTERVAL_MS);
}

function onChanged(): void {
  void runCheck();
}

export function startCalendarReminderWorker(): void {
  if (started) return;
  started = true;
  schedule();
  void runCheck();
  window.addEventListener(NORDLY_EVENTS.googleCalendarChanged, onChanged);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, onChanged);
  window.addEventListener('focus', onChanged);
  unsubscribeCache = subscribeGoogleCalendarCache(onChanged);
}

export function stopCalendarReminderWorker(): void {
  if (!started) return;
  started = false;
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener(NORDLY_EVENTS.googleCalendarChanged, onChanged);
  window.removeEventListener(NORDLY_EVENTS.settingsChanged, onChanged);
  window.removeEventListener('focus', onChanged);
  unsubscribeCache?.();
  unsubscribeCache = null;
}
