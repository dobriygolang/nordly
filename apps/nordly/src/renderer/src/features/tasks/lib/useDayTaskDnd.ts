import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
  isPointerInsideColumn,
  pointerInsertIndex,
  pointerInsertOverId,
  resolveColumnFromPointer,
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
  /** Horizontal scroll container — edge auto-scroll while dragging (task board). */
  scrollContainerRef?: RefObject<HTMLElement | null>;
}

export type CrossColumnPreview = {
  containerKey: string;
  insertAt: number;
};

const DRAG_EDGE_SCROLL_PX = 72;
const DRAG_EDGE_SCROLL_MAX_SPEED = 18;

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

/**
 * Multi-container drag:
 * - Same column: SortableContext transforms during drag; items commit on dragEnd only.
 * - Cross column: crossPreview state during drag; items + API commit on dragEnd only.
 */
export function useDayTaskDnd({
  columnKeys,
  tasksByDay,
  tasks,
  onDrop,
  noDropKeys = new Set<string>(),
  scrollContainerRef,
}: UseDayTaskDndOptions) {
  const [items, setItems] = useState<ColumnItems>(() => buildColumnItems(columnKeys, tasksByDay));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overContainerId, setOverContainerId] = useState<string | null>(null);
  const [originContainerId, setOriginContainerId] = useState<string | null>(null);
  const [originInsertAt, setOriginInsertAt] = useState<number | null>(null);
  const [crossPreview, setCrossPreview] = useState<CrossColumnPreview | null>(null);
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
  const lastResolvedColumnRef = useRef<string | null>(null);
  const originContainerIdRef = useRef<string | null>(null);
  const crossPreviewRef = useRef<CrossColumnPreview | null>(null);
  const pendingDragOverRef = useRef<DragOverEvent | null>(null);
  const dragLoopRef = useRef<number | null>(null);

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

  const stopDragLoop = useCallback(() => {
    if (dragLoopRef.current != null) {
      cancelAnimationFrame(dragLoopRef.current);
      dragLoopRef.current = null;
    }
    pendingDragOverRef.current = null;
  }, []);

  const findContainer = useCallback(
    (id: string): string | null => resolveTaskContainer(id, columnKeys, itemsRef.current),
    [columnKeys],
  );

  const runEdgeScroll = useCallback(() => {
    const el = scrollContainerRef?.current;
    const pointer = pointerCoordinatesRef.current;
    if (!el || !pointer) return;

    const rect = el.getBoundingClientRect();
    if (pointer.x < rect.left + DRAG_EDGE_SCROLL_PX) {
      const t = 1 - (pointer.x - rect.left) / DRAG_EDGE_SCROLL_PX;
      el.scrollLeft -= DRAG_EDGE_SCROLL_MAX_SPEED * Math.max(0, Math.min(1, t));
    } else if (pointer.x > rect.right - DRAG_EDGE_SCROLL_PX) {
      const t = 1 - (rect.right - pointer.x) / DRAG_EDGE_SCROLL_PX;
      el.scrollLeft += DRAG_EDGE_SCROLL_MAX_SPEED * Math.max(0, Math.min(1, t));
    }
  }, [scrollContainerRef]);

  const applyDragOver = useCallback(
    ({ active, over }: DragOverEvent) => {
      const overId = over?.id;
      if (overId == null) return;

      const overStr = String(overId);
      const activeStr = String(active.id);
      if (overStr === activeStr) return;

      const pointer = pointerCoordinatesRef.current;
      const rects = droppableRectsRef.current;
      const originContainer = originContainerIdRef.current;

      // Pointer back on source column — cancel cross-day preview (still dragging).
      if (
        originContainer &&
        pointer &&
        isPointerInsideColumn(pointer, originContainer, rects)
      ) {
        if (crossPreviewRef.current) {
          crossPreviewRef.current = null;
          setCrossPreview(null);
        }
        if (overContainerIdRef.current !== originContainer) {
          overContainerIdRef.current = originContainer;
          setOverContainerId(originContainer);
        }
        return;
      }

      const overContainer = findContainer(overStr);
      const activeContainer = findContainer(activeStr);

      if (!overContainer || !activeContainer) return;
      if (noDropKeys.has(overContainer)) return;

      if (overContainerIdRef.current !== overContainer) {
        overContainerIdRef.current = overContainer;
        setOverContainerId(overContainer);
      }

      if (activeContainer === overContainer) {
        if (crossPreviewRef.current) {
          crossPreviewRef.current = null;
          setCrossPreview(null);
        }
        return;
      }

      if (!originContainer) return;

      const overItems = (itemsRef.current[overContainer] ?? []).filter((id) => id !== activeStr);
      const insertAt =
        pointer != null
          ? pointerInsertIndex(overItems, activeStr, pointer, rects)
          : overItems.length;

      const nextPreview = { containerKey: overContainer, insertAt };
      const prevPreview = crossPreviewRef.current;
      if (
        prevPreview?.containerKey === nextPreview.containerKey &&
        prevPreview.insertAt === nextPreview.insertAt
      ) {
        return;
      }

      crossPreviewRef.current = nextPreview;
      setCrossPreview(nextPreview);
    },
    [findContainer, noDropKeys],
  );

  const syncCrossPreviewFromPointer = useCallback(() => {
    const activeStr = activeIdRef.current;
    const origin = originContainerIdRef.current;
    const pointer = pointerCoordinatesRef.current;
    const rects = droppableRectsRef.current;
    if (!activeStr || !origin || !pointer) return;

    if (isPointerInsideColumn(pointer, origin, rects)) {
      if (crossPreviewRef.current) {
        crossPreviewRef.current = null;
        setCrossPreview(null);
      }
      if (overContainerIdRef.current !== origin) {
        overContainerIdRef.current = origin;
        setOverContainerId(origin);
      }
      return;
    }

    const overContainer = resolveColumnFromPointer(
      pointer,
      columnKeys,
      rects,
      crossPreviewRef.current?.containerKey ?? lastResolvedColumnRef.current,
    );
    if (!overContainer || noDropKeys.has(overContainer)) {
      if (crossPreviewRef.current) {
        crossPreviewRef.current = null;
        setCrossPreview(null);
      }
      return;
    }

    // Sticky fallback can be origin while pointer sits in the gap — keep the current preview.
    if (overContainer === origin) {
      return;
    }

    lastResolvedColumnRef.current = overContainer;
    if (overContainerIdRef.current !== overContainer) {
      overContainerIdRef.current = overContainer;
      setOverContainerId(overContainer);
    }

    const overItems = (itemsRef.current[overContainer] ?? []).filter((id) => id !== activeStr);
    const insertAt = pointerInsertIndex(overItems, activeStr, pointer, rects);
    const nextPreview = { containerKey: overContainer, insertAt };
    if (
      crossPreviewRef.current?.containerKey === nextPreview.containerKey &&
      crossPreviewRef.current?.insertAt === nextPreview.insertAt
    ) {
      return;
    }

    crossPreviewRef.current = nextPreview;
    setCrossPreview(nextPreview);
  }, [columnKeys, noDropKeys]);

  const flushPendingDragOver = useCallback(() => {
    const pending = pendingDragOverRef.current;
    if (!pending) return;
    pendingDragOverRef.current = null;
    applyDragOver(pending);
  }, [applyDragOver]);

  const startDragLoop = useCallback(() => {
    if (dragLoopRef.current != null) return;
    const tick = () => {
      runEdgeScroll();
      syncCrossPreviewFromPointer();
      flushPendingDragOver();
      dragLoopRef.current = requestAnimationFrame(tick);
    };
    dragLoopRef.current = requestAnimationFrame(tick);
  }, [runEdgeScroll, flushPendingDragOver, syncCrossPreviewFromPointer]);

  // dnd-kit pointerCoordinates can drift/stale on long cross-column drags; track native coords.
  useEffect(() => {
    if (activeId == null) return;

    const onPointerMove = (event: PointerEvent) => {
      pointerCoordinatesRef.current = { x: event.clientX, y: event.clientY };
    };

    window.addEventListener('pointermove', onPointerMove, { capture: true });
    startDragLoop();
    return () => {
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      stopDragLoop();
    };
  }, [activeId, startDragLoop, stopDragLoop]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const pointer = pointerCoordinatesRef.current ?? args.pointerCoordinates ?? null;
      droppableRectsRef.current = args.droppableRects;

      if (pointer) {
        const containerKey = resolveColumnFromPointer(
          pointer,
          columnKeys,
          args.droppableRects,
          lastResolvedColumnRef.current,
        );
        if (containerKey) {
          lastResolvedColumnRef.current = containerKey;
          const containerItems = itemsRef.current[containerKey] ?? [];
          const overId = pointerInsertOverId(
            containerKey,
            containerItems,
            activeIdRef.current,
            pointer,
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
        const overStr = String(overId);
        const containerKey = columnKeySet.has(overStr)
          ? overStr
          : resolveTaskContainer(overStr, columnKeys, itemsRef.current);
        const resolvedContainer =
          pointer && containerKey
            ? resolveColumnFromPointer(
                pointer,
                columnKeys,
                args.droppableRects,
                lastResolvedColumnRef.current ?? containerKey,
              ) ?? containerKey
            : containerKey ?? lastResolvedColumnRef.current;
        if (resolvedContainer) {
          lastResolvedColumnRef.current = resolvedContainer;
          if (pointer) {
            overId = pointerInsertOverId(
              resolvedContainer,
              itemsRef.current[resolvedContainer] ?? [],
              activeIdRef.current,
              pointer,
              args.droppableRects,
            );
          }
        }
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
    flushPendingDragOver();
    stopDragLoop();
    setActiveId(null);
    setOverContainerId(null);
    setOriginContainerId(null);
    setOriginInsertAt(null);
    setCrossPreview(null);
    overContainerIdRef.current = null;
    originContainerIdRef.current = null;
    crossPreviewRef.current = null;
    clonedItemsRef.current = null;
    lastOverIdRef.current = null;
    recentlyMovedRef.current = false;
    pointerCoordinatesRef.current = null;
    droppableRectsRef.current = new Map();
    lastResolvedColumnRef.current = null;
    document.body.classList.remove('nordly-task-dragging');
  }, [flushPendingDragOver, stopDragLoop]);

  const handleDragStart = useCallback(
    ({ active, activatorEvent }: DragStartEvent) => {
      const activeStr = String(active.id);
      const container = findContainer(activeStr);
      const originIndex = (itemsRef.current[container ?? ''] ?? []).indexOf(activeStr);
      if (activatorEvent instanceof PointerEvent) {
        pointerCoordinatesRef.current = {
          x: activatorEvent.clientX,
          y: activatorEvent.clientY,
        };
      }
      setActiveId(activeStr);
      setOverContainerId(container);
      setOriginContainerId(container);
      setOriginInsertAt(originIndex >= 0 ? originIndex : null);
      overContainerIdRef.current = container;
      originContainerIdRef.current = container;
      lastResolvedColumnRef.current = container;
      crossPreviewRef.current = null;
      setCrossPreview(null);
      clonedItemsRef.current = cloneColumnItems(itemsRef.current);
      document.body.classList.add('nordly-task-dragging');
    },
    [findContainer],
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    pendingDragOverRef.current = event;
  }, []);

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      const activeStr = String(active.id);

      if (over == null) {
        endDrag();
        return;
      }

      const preview = crossPreviewRef.current;
      const origin = originContainerIdRef.current;
      const pointer = pointerCoordinatesRef.current;
      const rects = droppableRectsRef.current;
      const overStr = String(over.id);
      const overContainer = findContainer(overStr);
      const releaseContainer =
        pointer != null
          ? resolveColumnFromPointer(pointer, columnKeys, rects, overContainer)
          : overContainer;

      if (preview && origin && preview.containerKey !== origin) {
        if (releaseContainer !== preview.containerKey) {
          endDrag();
          return;
        }

        const list = (itemsRef.current[preview.containerKey] ?? []).filter((id) => id !== activeStr);
        const next = [...list];
        next.splice(preview.insertAt, 0, activeStr);

        const finalItems = { ...itemsRef.current };
        finalItems[origin] = (finalItems[origin] ?? []).filter((id) => id !== activeStr);
        finalItems[preview.containerKey] = next;
        setItems(finalItems);
        onDropRef.current(activeStr, preview.containerKey, insertBeforeTaskId(next, activeStr));
        endDrag();
        return;
      }

      const activeContainer = findContainer(activeStr);

      if (!overContainer || !activeContainer || noDropKeys.has(overContainer)) {
        if (clonedItemsRef.current) setItems(clonedItemsRef.current);
        endDrag();
        return;
      }

      let finalItems = itemsRef.current;

      if (activeContainer === overContainer && columnKeySet.has(overStr)) {
        const arr = finalItems[overContainer] ?? [];
        const oldIndex = arr.indexOf(activeStr);
        const lastIndex = arr.length - 1;
        if (oldIndex !== -1 && oldIndex !== lastIndex) {
          finalItems = { ...finalItems, [overContainer]: arrayMove(arr, oldIndex, lastIndex) };
          setItems(finalItems);
        }
      } else if (
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
    [findContainer, noDropKeys, endDrag, columnKeySet, columnKeys],
  );

  const handleDragCancel = useCallback(() => {
    if (clonedItemsRef.current) setItems(clonedItemsRef.current);
    endDrag();
  }, [endDrag]);

  const getCrossColumnTargetKey = useCallback((): string | null => {
    if (!originContainerId || !activeId) return null;

    const pointer = pointerCoordinatesRef.current;
    const rects = droppableRectsRef.current;

    if (pointer) {
      if (isPointerInsideColumn(pointer, originContainerId, rects)) {
        return null;
      }
      const over = resolveColumnFromPointer(
        pointer,
        columnKeys,
        rects,
        lastResolvedColumnRef.current,
      );
      if (over && over !== originContainerId) return over;
    }

    if (crossPreview && crossPreview.containerKey !== originContainerId) {
      return crossPreview.containerKey;
    }
    if (overContainerId && overContainerId !== originContainerId) {
      return overContainerId;
    }
    return null;
  }, [activeId, originContainerId, crossPreview, overContainerId, columnKeys]);

  const getColumnTaskIds = useCallback(
    (columnKey: string): string[] => {
      const ids = items[columnKey] ?? [];
      if (!activeId || !originContainerId || columnKey !== originContainerId) return ids;
      return ids.filter((id) => id !== activeId);
    },
    [items, activeId, originContainerId],
  );

  const getColumnInsertPreviewAt = useCallback(
    (columnKey: string): number | null => {
      if (!activeId || !originContainerId) return null;

      const targetKey = getCrossColumnTargetKey();

      if (targetKey) {
        if (columnKey !== targetKey) return null;
        if (crossPreview?.containerKey === targetKey) return crossPreview.insertAt;
        const overItems = (items[targetKey] ?? []).filter((id) => id !== activeId);
        const pointer = pointerCoordinatesRef.current;
        const rects = droppableRectsRef.current;
        if (pointer) return pointerInsertIndex(overItems, activeId, pointer, rects);
        return overItems.length;
      }

      if (columnKey === originContainerId && originInsertAt != null) {
        return originInsertAt;
      }

      return null;
    },
    [activeId, originContainerId, originInsertAt, crossPreview, items, getCrossColumnTargetKey],
  );

  return {
    sensors,
    collisionDetection,
    activeId,
    overContainerId,
    originContainerId,
    crossPreview,
    getColumnTaskIds,
    getColumnInsertPreviewAt,
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
