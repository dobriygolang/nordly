import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getFirstCollision,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type ClientRect,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type Over,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import type { TaskCard } from '@features/tasks/api/tasks';

import {
  buildColumnItems,
  cloneColumnItems,
  columnItemsEqual,
  insertBeforeTaskId,
  pointerInsertIndex,
  pointerInsertOverId,
  resolveTaskContainer,
  tasksByDaySignature,
  type ColumnItems,
} from './dayTaskDndUtils';

export interface UseDayTaskDndOptions {
  columnKeys: string[];
  tasksByDay: Map<string, TaskCard[]>;
  tasks: TaskCard[];
  onDrop: (taskId: string, dayKey: string, insertBeforeTaskId: string | null) => void;
  noDropKeys?: ReadonlySet<string>;
}

function moveIndexInList(
  ids: readonly string[],
  activeId: string,
  overId: string,
  active: Active,
  over: Over | null,
): number | null {
  const activeIndex = ids.indexOf(activeId);
  if (activeIndex === -1) return null;

  const overIndex = ids.indexOf(overId);
  if (overIndex === -1) return null;

  const translated = active.rect.current.translated;
  const isBelow =
    over != null &&
    translated != null &&
    translated.top + translated.height / 2 > over.rect.top + over.rect.height / 2;

  let newIndex = overIndex + (isBelow ? 1 : 0);
  if (activeIndex < newIndex) newIndex -= 1;

  if (newIndex === activeIndex) return null;
  return newIndex;
}

function resolveContainerFromPointer(
  pointer: { x: number; y: number },
  columnKeys: readonly string[],
  droppableRects: ReadonlyMap<string | number, ClientRect>,
): string | null {
  for (const columnKey of columnKeys) {
    const columnRect = droppableRects.get(columnKey);
    if (
      !columnRect ||
      pointer.x < columnRect.left ||
      pointer.x > columnRect.right ||
      pointer.y < columnRect.top ||
      pointer.y > columnRect.bottom
    ) {
      continue;
    }
    return columnKey;
  }
  return null;
}

function resolveOverFromPointer(
  containerKey: string,
  pointer: { x: number; y: number },
  items: ColumnItems,
  activeId: string | null,
  droppableRects: ReadonlyMap<string | number, ClientRect>,
): string {
  const containerItems = items[containerKey] ?? [];
  return pointerInsertOverId(containerKey, containerItems, activeId, pointer, droppableRects);
}

function resolveOverFromFallbackCollision(
  overId: string,
  pointer: { x: number; y: number } | null,
  columnKeys: readonly string[],
  columnKeySet: ReadonlySet<string>,
  items: ColumnItems,
  activeId: string | null,
  droppableRects: ReadonlyMap<string | number, ClientRect>,
): string {
  const containerKey = columnKeySet.has(overId)
    ? overId
    : resolveTaskContainer(overId, columnKeys, items);
  if (containerKey == null || pointer == null) return overId;
  return resolveOverFromPointer(containerKey, pointer, items, activeId, droppableRects);
}

function idsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Canonical @dnd-kit multi-container split for performance:
 * - Same column: SortableContext GPU transforms, except container hover means "move to end".
 * - Cross column: one items update per container change in onDragOver.
 * - onDragEnd: commit same-column reorder into items + API drop.
 */
export function useDayTaskDnd({
  columnKeys,
  tasksByDay,
  tasks,
  onDrop,
  noDropKeys = new Set<string>(),
}: UseDayTaskDndOptions) {
  const [items, setItems] = useState<ColumnItems>(() => buildColumnItems(columnKeys, tasksByDay));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overContainerId, setOverContainerId] = useState<string | null>(null);
  const overContainerIdRef = useRef<string | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;
  const clonedItemsRef = useRef<ColumnItems | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const lastOverIdRef = useRef<string | null>(null);
  const recentlyMovedRef = useRef(false);
  const pointerCoordinatesRef = useRef<{ x: number; y: number } | null>(null);
  const droppableRectsRef = useRef<ReadonlyMap<string | number, ClientRect>>(new Map());

  const columnKeySet = useMemo(() => new Set(columnKeys), [columnKeys]);
  const tasksByDaySig = useMemo(
    () => tasksByDaySignature(columnKeys, tasksByDay),
    [columnKeys, tasksByDay],
  );

  useEffect(() => {
    if (activeIdRef.current) return;
    const next = buildColumnItems(columnKeys, tasksByDay);
    setItems((prev) => (columnItemsEqual(prev, next) ? prev : next));
  }, [columnKeys, tasksByDaySig, tasksByDay]);

  useEffect(() => {
    if (!recentlyMovedRef.current) return;
    const frame = requestAnimationFrame(() => {
      recentlyMovedRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [items]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = useCallback(
    (id: string): string | null => resolveTaskContainer(id, columnKeys, itemsRef.current),
    [columnKeys],
  );

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const pointer = args.pointerCoordinates;
      pointerCoordinatesRef.current = pointer ?? null;
      droppableRectsRef.current = args.droppableRects;

      if (pointer) {
        const containerKey = resolveContainerFromPointer(pointer, columnKeys, args.droppableRects);
        if (containerKey) {
          const overId = resolveOverFromPointer(
            containerKey,
            pointer,
            itemsRef.current,
            activeIdRef.current,
            args.droppableRects,
          );
          lastOverIdRef.current = overId;
          return [{ id: overId }];
        }
      }

      const pointerIntersections = pointerWithin(args);
      const intersections =
        pointerIntersections.length > 0 ? pointerIntersections : rectIntersection(args);
      let overId = getFirstCollision(intersections, 'id');

      if (overId != null) {
        overId = resolveOverFromFallbackCollision(
          String(overId),
          pointer,
          columnKeys,
          columnKeySet,
          itemsRef.current,
          activeIdRef.current,
          args.droppableRects,
        );
        lastOverIdRef.current = String(overId);
        return [{ id: overId }];
      }

      if (recentlyMovedRef.current && lastOverIdRef.current) {
        return [{ id: lastOverIdRef.current }];
      }
      return lastOverIdRef.current ? [{ id: lastOverIdRef.current }] : [];
    },
    [columnKeySet, columnKeys],
  );

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const activeTask = activeId ? (taskById.get(activeId) ?? null) : null;

  const endDrag = useCallback(() => {
    setActiveId(null);
    setOverContainerId(null);
    overContainerIdRef.current = null;
    clonedItemsRef.current = null;
    lastOverIdRef.current = null;
    recentlyMovedRef.current = false;
    pointerCoordinatesRef.current = null;
    droppableRectsRef.current = new Map();
    document.body.classList.remove('nordly-task-dragging');
  }, []);

  const handleDragStart = useCallback(
    ({ active }: DragStartEvent) => {
      const activeStr = String(active.id);
      const container = findContainer(activeStr);
      setActiveId(activeStr);
      setOverContainerId(container);
      overContainerIdRef.current = container;
      clonedItemsRef.current = cloneColumnItems(itemsRef.current);
      document.body.classList.add('nordly-task-dragging');
    },
    [findContainer],
  );

  const handleDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      const overId = over?.id;
      if (overId == null) return;

      const overStr = String(overId);
      const activeStr = String(active.id);
      if (overStr === activeStr) return;

      const overContainer = findContainer(overStr);
      const activeContainer = findContainer(activeStr);

      if (!overContainer || !activeContainer) return;
      if (noDropKeys.has(overContainer)) return;

      if (overContainerIdRef.current !== overContainer) {
        overContainerIdRef.current = overContainer;
        setOverContainerId(overContainer);
      }

      if (activeContainer === overContainer) {
        if (!columnKeySet.has(overStr)) return;

        setItems((prev) => {
          const activeItems = prev[activeContainer] ?? [];
          const activeIndex = activeItems.indexOf(activeStr);
          const lastIndex = activeItems.length - 1;
          if (activeIndex === -1 || activeIndex === lastIndex) return prev;

          return {
            ...prev,
            [activeContainer]: arrayMove(activeItems, activeIndex, lastIndex),
          };
        });
        return;
      }

      setItems((prev) => {
        const activeItems = prev[activeContainer] ?? [];
        if (activeItems.indexOf(activeStr) === -1) return prev;

        const overItems = prev[overContainer] ?? [];
        const pointer = pointerCoordinatesRef.current;
        const rects = droppableRectsRef.current;
        const insertAt =
          pointer != null
            ? pointerInsertIndex(overItems, activeStr, pointer, rects)
            : overItems.filter((id) => id !== activeStr).length;

        const nextActiveItems = activeItems.filter((id) => id !== activeStr);
        const idsWithoutActive = overItems.filter((id) => id !== activeStr);
        const nextOverItems = [
          ...idsWithoutActive.slice(0, insertAt),
          activeStr,
          ...idsWithoutActive.slice(insertAt),
        ];

        if (
          idsEqual(prev[activeContainer] ?? [], nextActiveItems) &&
          idsEqual(prev[overContainer] ?? [], nextOverItems)
        ) {
          return prev;
        }

        recentlyMovedRef.current = true;

        return {
          ...prev,
          [activeContainer]: nextActiveItems,
          [overContainer]: nextOverItems,
        };
      });
    },
    [findContainer, noDropKeys, columnKeySet],
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      const activeStr = String(active.id);

      if (over == null) {
        endDrag();
        return;
      }

      const overStr = String(over.id);
      const overContainer = findContainer(overStr);
      const activeContainer = findContainer(activeStr);

      if (!overContainer || !activeContainer || noDropKeys.has(overContainer)) {
        if (clonedItemsRef.current) setItems(clonedItemsRef.current);
        endDrag();
        return;
      }

      let finalItems = itemsRef.current;

      if (
        activeContainer === overContainer &&
        overStr !== activeStr &&
        !columnKeySet.has(overStr)
      ) {
        const arr = finalItems[overContainer] ?? [];
        const oldIndex = arr.indexOf(activeStr);
        const newIndex = moveIndexInList(arr, activeStr, overStr, active, over);
        if (oldIndex !== -1 && newIndex != null) {
          finalItems = { ...finalItems, [overContainer]: arrayMove(arr, oldIndex, newIndex) };
          setItems(finalItems);
        }
      }

      const finalArr = finalItems[overContainer] ?? [];
      onDropRef.current(activeStr, overContainer, insertBeforeTaskId(finalArr, activeStr));
      endDrag();
    },
    [findContainer, noDropKeys, endDrag, columnKeySet],
  );

  const handleDragCancel = useCallback(() => {
    if (clonedItemsRef.current) setItems(clonedItemsRef.current);
    endDrag();
  }, [endDrag]);

  return {
    sensors,
    collisionDetection,
    activeId,
    overContainerId,
    items,
    taskById,
    activeTask,
    isDragging: activeId !== null,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}
