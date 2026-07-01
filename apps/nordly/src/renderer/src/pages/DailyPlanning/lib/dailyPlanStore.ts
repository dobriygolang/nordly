import { dbGet, dbPut, requireUserId } from '@shared/db/nordlyDb';

import { toDayKey } from '@pages/TaskBoard/lib/dates';

export interface DailyPlanRecord {
  obstacles?: string;
  finalizedAt?: string;
}

function metaKey(userId: string, dayKey: string): string {
  return `daily_plan::${userId}::${dayKey}`;
}

interface DailyPlanMetaRow extends DailyPlanRecord {
  key: string;
  userId: string;
  dayKey: string;
  updatedAt: number;
}

export async function loadDailyPlan(dayKey = toDayKey(new Date())): Promise<DailyPlanRecord> {
  const userId = requireUserId();
  const row = await dbGet<DailyPlanMetaRow>('meta', metaKey(userId, dayKey));
  if (!row) return {};
  return { obstacles: row.obstacles, finalizedAt: row.finalizedAt };
}

export async function saveDailyPlanObstacles(
  obstacles: string,
  dayKey = toDayKey(new Date()),
): Promise<void> {
  const userId = requireUserId();
  const prev = await loadDailyPlan(dayKey);
  await dbPut('meta', {
    key: metaKey(userId, dayKey),
    userId,
    dayKey,
    obstacles,
    finalizedAt: prev.finalizedAt,
    updatedAt: Date.now(),
  });
}

export async function finalizeDailyPlan(
  obstacles: string,
  dayKey = toDayKey(new Date()),
): Promise<void> {
  const userId = requireUserId();
  await dbPut('meta', {
    key: metaKey(userId, dayKey),
    userId,
    dayKey,
    obstacles,
    finalizedAt: new Date().toISOString(),
    updatedAt: Date.now(),
  });
}
