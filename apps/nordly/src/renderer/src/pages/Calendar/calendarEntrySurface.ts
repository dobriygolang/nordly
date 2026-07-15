import type { CalendarEntry } from '@features/calendar/api/calendar';
import type { TaskEpic } from '@features/tasks/api/epics';
import { epicEntrySurface, resolveTaskEpicColor } from '@features/tasks/lib/epicColor';

export function calendarEpicSurface(
  entry: CalendarEntry,
  epics: TaskEpic[],
  opts?: { dragging?: boolean },
): Record<string, string> | null {
  if (entry.source !== 'task') return null;
  const color = resolveTaskEpicColor(
    { epicId: entry.epicId, epicColor: entry.epicColor },
    epics,
  );
  return epicEntrySurface(color, {
    done: entry.taskStatus === 'done',
    dragging: opts?.dragging,
  });
}
