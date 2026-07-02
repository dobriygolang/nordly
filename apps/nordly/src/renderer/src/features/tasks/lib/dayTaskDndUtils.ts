import type { ClientRect } from '@dnd-kit/core';

import type { TaskCard } from '@features/tasks/api/tasks';

export type ColumnItems = Record<string, string[]>;

type DroppableRectMap = ReadonlyMap<string | number, ClientRect>;

type ItemRect = { id: string; rect: ClientRect };

export function buildColumnItemRects(
  itemIds: readonly string[],
  excludeId: string | null,
  droppableRects: DroppableRectMap,
): ItemRect[] {
  return itemIds
    .filter((id) => id !== excludeId)
    .map((id) => {
      const rect = droppableRects.get(id);
      return rect ? { id, rect } : null;
    })
    .filter((entry): entry is ItemRect => entry != null)
    .sort((a, b) => a.rect.top - b.rect.top);
}

/** Insert index for ids excluding the active task, based on pointer Y. */
export function pointerInsertIndex(
  itemIds: readonly string[],
  excludeId: string | null,
  pointer: { x: number; y: number },
  droppableRects: DroppableRectMap,
): number {
  const idsWithoutActive = itemIds.filter((id) => id !== excludeId);
  const itemRects = buildColumnItemRects(idsWithoutActive, null, droppableRects);

  // Rects can lag one frame after a cross-column move; default to append, not top.
  if (itemRects.length === 0) return idsWithoutActive.length;

  const last = itemRects[itemRects.length - 1]!;
  if (pointer.y >= last.rect.top + last.rect.height / 2) {
    return idsWithoutActive.length;
  }

  for (const { id, rect } of itemRects) {
    if (pointer.y < rect.top + rect.height / 2) {
      return idsWithoutActive.indexOf(id);
    }
  }

  return idsWithoutActive.length;
}

/** Collision target id: task id = insert before; column id = append. */
export function pointerInsertOverId(
  containerKey: string,
  itemIds: readonly string[],
  excludeId: string | null,
  pointer: { x: number; y: number },
  droppableRects: DroppableRectMap,
): string {
  const itemRects = buildColumnItemRects(itemIds, excludeId, droppableRects);
  if (itemRects.length === 0) return containerKey;

  const last = itemRects[itemRects.length - 1]!;
  if (pointer.y >= last.rect.top + last.rect.height / 2) {
    return containerKey;
  }

  for (const { id, rect } of itemRects) {
    if (pointer.y < rect.top + rect.height / 2) {
      return id;
    }
  }

  return containerKey;
}

export function buildColumnItems(
  columnKeys: string[],
  tasksByDay: Map<string, TaskCard[]>,
): ColumnItems {
  const items: ColumnItems = {};
  for (const key of columnKeys) {
    items[key] = (tasksByDay.get(key) ?? []).map((task) => task.id);
  }
  return items;
}

export function cloneColumnItems(items: ColumnItems): ColumnItems {
  const next: ColumnItems = {};
  for (const [key, ids] of Object.entries(items)) {
    next[key] = [...ids];
  }
  return next;
}

export function tasksByDaySignature(
  columnKeys: readonly string[],
  tasksByDay: Map<string, TaskCard[]>,
): string {
  return columnKeys
    .map((key) => `${key}:${(tasksByDay.get(key) ?? []).map((task) => task.id).join(',')}`)
    .join('|');
}

export function resolveTaskContainer(
  id: string,
  columnKeys: readonly string[],
  items: ColumnItems,
): string | null {
  if (columnKeys.includes(id)) return id;
  for (const key of columnKeys) {
    if (items[key]?.includes(id)) return key;
  }
  return null;
}

export function insertBeforeTaskId(containerIds: string[], taskId: string): string | null {
  const idx = containerIds.indexOf(taskId);
  if (idx < 0 || idx >= containerIds.length - 1) return null;
  return containerIds[idx + 1] ?? null;
}

export function columnItemsEqual(a: ColumnItems, b: ColumnItems): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const left = a[key] ?? [];
    const right = b[key] ?? [];
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
  }
  return true;
}

export function uniqueTaskIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function resolveTasksForColumn(
  taskIds: string[],
  taskById: Map<string, TaskCard>,
): TaskCard[] {
  return uniqueTaskIds(taskIds)
    .map((id) => taskById.get(id))
    .filter((task): task is TaskCard => task != null);
}
