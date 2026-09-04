import type { TaskCard } from '@features/tasks/model/task';
import { isTaskDone } from '@features/tasks/model/status';
import { taskScheduleStart } from '@shared/lib/dates';

/** Stable order inside a real day column: unfinished first, then manual/local order. */
export function compareTaskDayOrder(a: TaskCard, b: TaskCard): number {
  const statusDelta =
    Number(isTaskDone(a.status)) - Number(isTaskDone(b.status));
  if (statusDelta !== 0) return statusDelta;

  const aOrder =
    a.order ?? taskScheduleStart(a)?.getTime() ?? new Date(a.createdAt).getTime();
  const bOrder =
    b.order ?? taskScheduleStart(b)?.getTime() ?? new Date(b.createdAt).getTime();
  return aOrder - bOrder;
}

export function reorderTaskColumn(
  tasks: TaskCard[],
  taskId: string,
  insertBeforeTaskId: string | null,
): TaskCard[] | null {
  const ordered = [...tasks].sort(compareTaskDayOrder);
  const moved = ordered.find((task) => task.id === taskId);
  if (!moved) return null;

  const withoutMoved = ordered.filter((task) => task.id !== taskId);
  const insertAt = insertBeforeTaskId
    ? withoutMoved.findIndex((task) => task.id === insertBeforeTaskId)
    : withoutMoved.length;
  if (insertBeforeTaskId && insertAt === -1) return null;

  withoutMoved.splice(insertAt, 0, moved);
  return withoutMoved.map((task, order) => ({ ...task, order }));
}

export function mergeTaskColumnOrder(
  tasks: TaskCard[],
  reordered: TaskCard[],
): TaskCard[] {
  const orderById = new Map(reordered.map((task) => [task.id, task.order]));
  return tasks.map((task) =>
    orderById.has(task.id) ? { ...task, order: orderById.get(task.id) } : task,
  );
}
