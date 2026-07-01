import {
  dbDelete,
  dbGet,
  dbGetAllByUser,
  dbPut,
  entityKey,
  requireUserId,
} from '@shared/db/nordlyDb';

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
    order: local.order ?? remote.order,
    epicId,
    epicColor: epicId ? undefined : local.epicColor,
  };
}

export async function tasksStoreList(userId?: string): Promise<TaskCard[]> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByUser<StoredTask>('tasks', uid);
  return rows
    .filter((r) => !r.deleted)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
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
  const existing = await dbGet<StoredTask>('tasks', entityKey(oldId, userId));
  await dbDelete('tasks', entityKey(oldId, userId));
  const { userId: _u, key: _k, deleted: _d, ...localTask } = existing ?? {};
  const merged = existing
    ? preserveLocalOnlyTaskFields(localTask as TaskCard, task)
    : task;
  await dbPut('tasks', rowFrom(userId, merged));
}
