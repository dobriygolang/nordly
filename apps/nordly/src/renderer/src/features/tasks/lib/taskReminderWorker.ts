import { translate } from '@nordly-i18n';

import { listTasks, displayTaskTitle, type TaskCard } from '@features/tasks/api/tasks';
import { notify } from '@shared/api/notifications';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { parseScheduleInstant } from '@shared/lib/dates';
import { readSettings } from '@shared/model/settings';

const CHECK_INTERVAL_MS = 30_000;
const LOOK_BACK_MS = 45_000;
const LOOK_AHEAD_MS = 15_000;
const SEEN_MAX = 400;
const ACTIVE = new Set(['todo', 'in_progress', 'in_review']);

let started = false;
let intervalId: number | null = null;
let checking = false;
const seen = new Set<string>();

function remindersEnabled(): boolean {
  const settings = readSettings();
  return settings.notifications && settings.taskNotifications;
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

async function emitReminder(task: TaskCard, start: Date): Promise<void> {
  const key = `task:${task.id}:${start.toISOString()}`;
  if (seen.has(key)) return;
  seen.add(key);
  trimSeen();

  await notify(
    translate('nordly.task.reminder.title'),
    translate('nordly.task.reminder.body', {
      title: displayTaskTitle(task.title, task.id, translate('nordly.taskboard.untitled')),
      time: formatReminderTime(start),
    }),
    { sound: 'calendar' },
  );
}

async function checkTasks(now = Date.now()): Promise<void> {
  const tasks = await listTasks();
  await Promise.all(
    tasks.map(async (task) => {
      if (!ACTIVE.has(task.status) || !task.scheduledStart) return;
      const start = parseScheduleInstant(task.scheduledStart);
      if (Number.isNaN(start.getTime()) || !isDue(start, now)) return;
      await emitReminder(task, start);
    }),
  );
}

async function runCheck(): Promise<void> {
  if (checking || !remindersEnabled()) return;
  checking = true;
  try {
    await checkTasks(Date.now());
  } catch (err) {
    console.error('[nordly:task-reminder]', err);
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

/** Local-first: remind when a scheduled Nordly task starts (settings-gated). */
export function startTaskReminderWorker(): void {
  if (started) return;
  started = true;
  schedule();
  void runCheck();
  window.addEventListener(NORDLY_EVENTS.tasksChanged, onChanged);
  window.addEventListener(NORDLY_EVENTS.settingsChanged, onChanged);
  window.addEventListener('focus', onChanged);
}

export function stopTaskReminderWorker(): void {
  if (!started) return;
  started = false;
  if (intervalId !== null) window.clearInterval(intervalId);
  intervalId = null;
  window.removeEventListener(NORDLY_EVENTS.tasksChanged, onChanged);
  window.removeEventListener(NORDLY_EVENTS.settingsChanged, onChanged);
  window.removeEventListener('focus', onChanged);
}
