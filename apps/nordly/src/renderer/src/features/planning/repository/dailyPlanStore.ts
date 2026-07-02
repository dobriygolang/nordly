import { dbGet, dbPut, requireUserId } from '@shared/db/nordlyDb';
import { toDayKey } from '@shared/lib/dates';

export interface DailyPlanSnapshot {
  taskIds: string[];
  activeCount: number;
  totalDurationMin: number;
}

export interface DailyPlanRecord {
  obstacles?: string;
  finalizedAt?: string;
  snapshot?: DailyPlanSnapshot;
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

function rowToRecord(row: DailyPlanMetaRow | null | undefined): DailyPlanRecord {
  if (!row) return {};
  return {
    obstacles: row.obstacles,
    finalizedAt: row.finalizedAt,
    snapshot: row.snapshot,
  };
}

export async function loadDailyPlan(dayKey = toDayKey(new Date())): Promise<DailyPlanRecord> {
  const userId = requireUserId();
  const row = await dbGet<DailyPlanMetaRow>('meta', metaKey(userId, dayKey));
  return rowToRecord(row);
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
    snapshot: prev.snapshot,
    updatedAt: Date.now(),
  });
}

export async function finalizeDailyPlan(
  obstacles: string,
  snapshot: DailyPlanSnapshot,
  dayKey = toDayKey(new Date()),
): Promise<void> {
  const userId = requireUserId();
  await dbPut('meta', {
    key: metaKey(userId, dayKey),
    userId,
    dayKey,
    obstacles,
    snapshot,
    finalizedAt: new Date().toISOString(),
    updatedAt: Date.now(),
  });
}
