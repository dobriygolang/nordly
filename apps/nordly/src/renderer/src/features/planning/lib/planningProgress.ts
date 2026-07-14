import { toDayKey } from '@shared/lib/dates';

import type { TaskCard } from '@features/tasks/api/tasks';

import type { DailyPlanRecord, DailyPlanSnapshot } from '../repository/dailyPlanStore';

export interface PlanProgress {
  plannedTotal: number;
  doneCount: number;
  activeRemaining: number;
  plannedDurationMin: number;
}

export function isPlanFinalizedToday(record: DailyPlanRecord, dayKey: string): boolean {
  if (!record.finalizedAt) return false;
  return toDayKey(new Date(record.finalizedAt)) === dayKey;
}

export function parseObstacleLines(value: string | undefined): string[] {
  return (value ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function computePlanProgress(
  snapshot: DailyPlanSnapshot | undefined,
  todayTasks: TaskCard[],
): PlanProgress | null {
  if (!snapshot?.taskIds?.length) return null;
  const idSet = new Set(snapshot.taskIds);
  const planned = todayTasks.filter((task) => idSet.has(task.id));
  const doneCount = planned.filter((task) => task.status === 'done').length;
  return {
    plannedTotal: snapshot.taskIds.length,
    doneCount,
    activeRemaining: planned.filter((task) => task.status !== 'done').length,
    plannedDurationMin: snapshot.totalDurationMin,
  };
}
