import type { CalendarEntry } from './events';
import type { TaskEpic } from '@features/tasks/api/epics';
import { epicEntrySurface, resolveTaskEpicColor } from '@features/tasks/lib/epicColor';
import { isTaskDone } from '@features/tasks/model/status';
import { CalendarEntrySource } from '../model/entry';

export function calendarEpicSurface(
  entry: CalendarEntry,
  epics: TaskEpic[],
  opts?: { dragging?: boolean },
): Record<string, string> | null {
  if (entry.source !== CalendarEntrySource.Task) return null;
  const color = resolveTaskEpicColor(
    { epicId: entry.epicId, epicColor: entry.epicColor },
    epics,
  );
  return epicEntrySurface(color, {
    done: entry.taskStatus ? isTaskDone(entry.taskStatus) : false,
    dragging: opts?.dragging,
  });
}
