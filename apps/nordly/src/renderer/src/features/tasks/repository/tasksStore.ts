import {
  dbDelete,
  dbGet,
  dbGetAllByUser,
  dbPut,
  entityKey,
  requireUserId,
} from '@shared/db/nordlyDb';
import { getServerId } from '@shared/sync/idMap';

import type { TaskCard } from '../api/tasks';

export interface StoredTask extends TaskCard {
  userId: string;
  key: string;
  deleted?: boolean;
}

/** Device-only fields preserved when merging a newer remote task row. */
export type LocalOnlyTaskField = 'order' | 'epicColor' | 'epicId';

function rowFrom(userId: string, task: TaskCard, deleted = false): StoredTask {
  return { ...task, userId, key: entityKey(task.id, userId), deleted };
}

/** Keep column order and pending epic assignment when applying a remote snapshot. */
export function preserveLocalOnlyTaskFields(local: TaskCard, remote: TaskCard): TaskCard {
  const epicId = remote.epicId ?? local.epicId;
  return {
    ...remote,
    order: local.order,
    epicId,
    epicColor: epicId ? undefined : local.epicColor,
  };
}

function taskFromRow(row: StoredTask): TaskCard {
  const { userId: _u, key: _k, deleted: _d, ...task } = row;
  return task;
}

/** Collapse duplicate rows (same task id, mismatched keys) and drop superseded local ids. */
export async function reconcileTasksStore(userId?: string): Promise<number> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByUser<StoredTask>('tasks', uid);
  const active = rows.filter((r) => !r.deleted);
  let removed = 0;

  const groups = new Map<string, StoredTask[]>();
  for (const row of active) {
    const list = groups.get(row.id) ?? [];
    list.push(row);
    groups.set(row.id, list);
  }

  for (const [id, group] of groups) {
    group.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const keeper = group[0];
    const canonicalKey = entityKey(id, uid);

    for (let i = 1; i < group.length; i++) {
      await dbDelete('tasks', group[i].key);
      removed++;
    }

    if (keeper.key !== canonicalKey) {
      await dbDelete('tasks', keeper.key);
      await dbPut('tasks', rowFrom(uid, taskFromRow(keeper)));
      if (group.length === 1) removed++;
    }
  }

  for (const row of active) {
    const mapped = await getServerId('tasks', row.id, uid);
    if (!mapped || mapped === row.id) continue;
    const serverRow = await dbGet<StoredTask>('tasks', entityKey(mapped, uid));
    if (serverRow && !serverRow.deleted) {
      await dbDelete('tasks', entityKey(row.id, uid));
      removed++;
    }
  }

  return removed;
}

export async function tasksStoreList(userId?: string): Promise<TaskCard[]> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByUser<StoredTask>('tasks', uid);
  const active = rows.filter((r) => !r.deleted);

  const byId = new Map<string, TaskCard>();
  for (const row of active) {
    const task = taskFromRow(row);
    const prev = byId.get(task.id);
    if (!prev || new Date(task.updatedAt).getTime() >= new Date(prev.updatedAt).getTime()) {
      byId.set(task.id, task);
    }
  }

  if (byId.size < active.length) {
    await reconcileTasksStore(uid);
  }

  const rowsAfter = await dbGetAllByUser<StoredTask>('tasks', uid);
  const deduped = new Map<string, TaskCard>();
  for (const row of rowsAfter.filter((r) => !r.deleted)) {
    const task = taskFromRow(row);
    const prev = deduped.get(task.id);
    if (!prev || new Date(task.updatedAt).getTime() >= new Date(prev.updatedAt).getTime()) {
      deduped.set(task.id, task);
    }
  }

  return [...deduped.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export async function tasksStoreGet(id: string, userId?: string): Promise<TaskCard | null> {
  const uid = userId ?? requireUserId();
  const row = await dbGet<StoredTask>('tasks', entityKey(id, uid));
  if (!row || row.deleted) return null;
  const { userId: _u, key: _k, deleted: _d, ...task } = row;
  return task;
}

export async function tasksStorePut(task: TaskCard): Promise<void> {
  const userId = requireUserId();
  await dbPut('tasks', rowFrom(userId, task));
}

/** Apply a remote/API task while keeping device-only fields from the local row. */
export async function tasksStoreApplyRemote(task: TaskCard): Promise<TaskCard> {
  const userId = requireUserId();
  const local = await dbGet<StoredTask>('tasks', entityKey(task.id, userId));
  const merged = local ? preserveLocalOnlyTaskFields(local, task) : task;
  await dbPut('tasks', rowFrom(userId, merged));
  return merged;
}

export async function tasksStoreMergeRemote(task: TaskCard): Promise<void> {
  const userId = requireUserId();
  const local = await dbGet<StoredTask>('tasks', entityKey(task.id, userId));
  if (!local) {
    await dbPut('tasks', rowFrom(userId, task));
    return;
  }
  const lt = new Date(local.updatedAt).getTime();
  const rt = new Date(task.updatedAt).getTime();
  if (rt >= lt) {
    await dbPut('tasks', rowFrom(userId, preserveLocalOnlyTaskFields(local, task)));
  }
}

export async function tasksStoreBulkImport(
  userId: string,
  records: Record<string, TaskCard>,
): Promise<void> {
  for (const task of Object.values(records)) {
    await dbPut('tasks', rowFrom(userId, task));
  }
}

export async function tasksStoreSoftDelete(id: string): Promise<void> {
  const userId = requireUserId();
  const existing = await dbGet<StoredTask>('tasks', entityKey(id, userId));
  if (!existing) return;
  await dbPut('tasks', {
    ...existing,
    deleted: true,
    updatedAt: new Date().toISOString(),
  });
}

export async function tasksStoreReplaceId(oldId: string, task: TaskCard): Promise<void> {
  const userId = requireUserId();
  const rows = await dbGetAllByUser<StoredTask>('tasks', userId);
  const existing = rows.find((r) => r.key === entityKey(oldId, userId) || r.id === oldId);

  for (const row of rows) {
    if (row.id === oldId || row.key === entityKey(oldId, userId)) {
      await dbDelete('tasks', row.key);
    }
  }

  const merged = existing
    ? preserveLocalOnlyTaskFields(taskFromRow(existing), task)
    : task;
  await dbPut('tasks', rowFrom(userId, merged));
}
