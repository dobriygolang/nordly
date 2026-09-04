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

let writeTail: Promise<void> = Promise.resolve();

function enqueueDailyPlanWrite(write: () => Promise<void>): Promise<void> {
  const result = writeTail.then(write);
  writeTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function sameDailyPlan(a: DailyPlanRecord, b: DailyPlanRecord): boolean {
  if (a.obstacles !== b.obstacles || a.finalizedAt !== b.finalizedAt) return false;
  const left = a.snapshot;
  const right = b.snapshot;
  if (left === right) return true;
  if (!left || !right) return false;
  if (left.activeCount !== right.activeCount || left.totalDurationMin !== right.totalDurationMin) {
    return false;
  }
  if (left.taskIds.length !== right.taskIds.length) return false;
  for (let i = 0; i < left.taskIds.length; i++) {
    if (left.taskIds[i] !== right.taskIds[i]) return false;
  }
  return true;
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
  return enqueueDailyPlanWrite(async () => {
    const row = await dbGet<DailyPlanMetaRow>('meta', metaKey(userId, dayKey));
    const prev = rowToRecord(row);
    await dbPut('meta', {
      key: metaKey(userId, dayKey),
      userId,
      dayKey,
      obstacles,
      finalizedAt: prev.finalizedAt,
      snapshot: prev.snapshot,
      updatedAt: Date.now(),
    });
  });
}

export async function finalizeDailyPlan(
  obstacles: string,
  snapshot: DailyPlanSnapshot,
  dayKey = toDayKey(new Date()),
): Promise<void> {
  const userId = requireUserId();
  return enqueueDailyPlanWrite(async () => {
    await dbPut('meta', {
      key: metaKey(userId, dayKey),
      userId,
      dayKey,
      obstacles,
      snapshot,
      finalizedAt: new Date().toISOString(),
      updatedAt: Date.now(),
    });
  });
}
