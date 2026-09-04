import { translate } from '@nordly-i18n';

import {
  googleEventDisplayDate,
  type GoogleCalendarEvent,
} from '@features/calendar/model/calendar';
import { readSettings } from '@shared/model/settings';
import { notify } from '@shared/api/notifications';
import { requireUserId } from '@shared/db/nordlyDb';
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
let workerGeneration = 0;
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
  if (!Number.isFinite(t)) throw new Error('Invalid calendar reminder date');
  return t >= now - LOOK_BACK_MS && t <= now + LOOK_AHEAD_MS;
}

function formatReminderTime(start: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(start);
}

async function emitReminder(id: string, title: string, start: Date): Promise<void> {
  const key = `${requireUserId()}:google:${id}:${start.toISOString()}`;
  if (seen.has(key)) return;
  seen.add(key);
  trimSeen();

  try {
    await notify(
      translate('nordly.calendar.reminder.google_title'),
      translate('nordly.calendar.reminder.body', {
        title: title || translate('nordly.calendar.title'),
        time: formatReminderTime(start),
      }),
      { sound: 'calendar' },
    );
  } catch (error) {
    seen.delete(key);
    throw error;
  }
}

async function checkGoogleEvents(now: number, generation: number): Promise<void> {
  const { timeMin, timeMax } = defaultGoogleSyncWindow(new Date(now));
  const events = peekGoogleCalendarEvents(timeMin, timeMax);
  if (!events) return;

  await Promise.all(
    events.map(async (event: GoogleCalendarEvent) => {
      if (generation !== workerGeneration || event.allDay) return;
      const start = googleEventDisplayDate(event.start, false);
      if (!isDue(start, now)) return;
      if (generation !== workerGeneration) return;
      await emitReminder(`${event.calendarId}:${event.id}`, event.title, start);
    }),
  );
}

async function runCheck(): Promise<void> {
  if (!started || checking || !remindersEnabled()) return;
  checking = true;
  const generation = workerGeneration;
  const now = Date.now();
  try {
    await checkGoogleEvents(now, generation);
  } catch (err) {
    if (generation === workerGeneration) {
      console.error('[nordly:calendar-reminder]', err);
    }
  } finally {
    if (generation === workerGeneration || !started) checking = false;
  }
}

function schedule(): void {
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = window.setInterval(() => {
    if (document.hidden) return;
    void runCheck();
  }, CHECK_INTERVAL_MS);
}

function onChanged(): void {
  if (document.hidden) return;
  void runCheck();
}

function onVisible(): void {
  if (document.visibilityState === 'visible') void runCheck();
}

export function startCalendarReminderWorker(): void {
  if (started) return;
  started = true;
  workerGeneration += 1;
  schedule();
  void runCheck();
  window.addEventListener(NORDLY_EVENTS.googleCalendarChanged, onChanged);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, onChanged);
  window.addEventListener('focus', onChanged);
  document.addEventListener('visibilitychange', onVisible);
  unsubscribeCache = subscribeGoogleCalendarCache(onChanged);
}

export function stopCalendarReminderWorker(): void {
  if (!started) return;
  started = false;
  workerGeneration += 1;
  checking = false;
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener(NORDLY_EVENTS.googleCalendarChanged, onChanged);
  window.removeEventListener(NORDLY_EVENTS.settingsChanged, onChanged);
  window.removeEventListener('focus', onChanged);
  document.removeEventListener('visibilitychange', onVisible);
  unsubscribeCache?.();
  unsubscribeCache = null;
}
