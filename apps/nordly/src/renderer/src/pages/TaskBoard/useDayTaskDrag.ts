import { useCallback, useEffect, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 5;

interface DragSession {
  taskId: string;
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  el: HTMLElement;
  ghost: HTMLElement | null;
  active: boolean;
}

function hitTestAt(
  x: number,
  y: number,
  ignoreTaskId: string | null,
): { dayKey: string | null; insertBeforeTaskId: string | null } {
  const hit = document.elementFromPoint(x, y);
  const body = hit?.closest('.nordly-day-column__body');
  if (!body) return { dayKey: null, insertBeforeTaskId: null };

  const section = body.closest('[data-day-key]');
  if (section?.hasAttribute('data-planning-no-drop')) {
    return { dayKey: null, insertBeforeTaskId: null };
  }
  const dayKey = section?.getAttribute('data-day-key') ?? null;
  if (!dayKey) return { dayKey: null, insertBeforeTaskId: null };

  const col = document.querySelector<HTMLElement>(`.nordly-day-column[data-day-key="${dayKey}"]`);
  const rows = [...(col?.querySelectorAll<HTMLElement>('[data-task-row]') ?? [])].filter((row) => {
    const id = row.getAttribute('data-task-id');
    if (!id || id === ignoreTaskId) return false;
    if (row.dataset.dragging === 'true') return false;
    return window.getComputedStyle(row).display !== 'none';
  });

  for (const row of rows) {
    const id = row.getAttribute('data-task-id');
    if (!id) continue;
    const r = row.getBoundingClientRect();
    const midY = r.top + r.height / 2;
    if (y < midY) return { dayKey, insertBeforeTaskId: id };
  }

  return { dayKey, insertBeforeTaskId: null };
}

let activeDropDay: string | null = null;

function syncDropChrome(dayKey: string | null): void {
  if (dayKey === activeDropDay) return;

  if (activeDropDay) {
    document
      .querySelector(
        `.nordly-day-column[data-day-key="${CSS.escape(activeDropDay)}"] .nordly-day-column__body`,
      )
      ?.classList.remove('nordly-day-column__body--drop');
  }
  if (dayKey) {
    document
      .querySelector(
        `.nordly-day-column[data-day-key="${CSS.escape(dayKey)}"] .nordly-day-column__body`,
      )
      ?.classList.add('nordly-day-column__body--drop');
  }
  activeDropDay = dayKey;
}

function clearDropChrome(): void {
  activeDropDay = null;
  for (const el of document.querySelectorAll('.nordly-day-column__body--drop')) {
    el.classList.remove('nordly-day-column__body--drop');
  }
}

function createGhost(fromEl: HTMLElement): HTMLElement {
  const ghost = fromEl.cloneNode(true) as HTMLElement;
  ghost.setAttribute('data-drag-ghost', 'true');
  ghost.removeAttribute('data-task-id');
  ghost.removeAttribute('data-task-row');
  ghost.querySelectorAll('[data-task-id]').forEach((el) => {
    el.removeAttribute('data-task-id');
  });
  ghost.style.position = 'fixed';
  ghost.style.zIndex = '9999';
  ghost.style.pointerEvents = 'none';
  ghost.style.width = `${fromEl.offsetWidth}px`;
  ghost.style.opacity = '0.92';
  ghost.style.background = 'rgb(22 22 22 / 0.96)';
  ghost.style.borderRadius = '12px';
  ghost.style.boxShadow = '0 16px 40px -10px rgb(0 0 0 / 0.5)';
  ghost.style.transformOrigin = 'center';
  ghost.style.willChange = 'transform';
  // Tactile pickup: start slightly shrunk, then lift + tilt on the next frame.
  ghost.style.transform = 'scale(0.97)';
  ghost.style.transition = 'transform 150ms cubic-bezier(0.2, 0.7, 0.2, 1)';
  document.body.appendChild(ghost);
  requestAnimationFrame(() => {
    ghost.style.transform = 'scale(1.03) rotate(1.5deg)';
  });
  return ghost;
}

/** Quick fade — runs in parallel with list update, does not block drop. */
function dismissGhost(ghost: HTMLElement): void {
  ghost.style.transition =
    'transform 100ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 100ms cubic-bezier(0.2, 0.7, 0.2, 1)';
  ghost.style.transform = 'scale(1) rotate(0deg)';
  ghost.style.opacity = '0';
  window.setTimeout(() => ghost.remove(), 110);
}

function moveGhost(ghost: HTMLElement, x: number, y: number, offsetX: number, offsetY: number): void {
  ghost.style.left = `${x - offsetX}px`;
  ghost.style.top = `${y - offsetY}px`;
}

function clearTextSelection(): void {
  window.getSelection()?.removeAllRanges();
}

function setDragSelectLock(locked: boolean): void {
  document.body.style.userSelect = locked ? 'none' : '';
  document.documentElement.style.userSelect = locked ? 'none' : '';
  document.body.classList.toggle('nordly-task-dragging', locked);
}

/** Pointer drag with floating ghost — reliable in Tauri/WKWebView where HTML5 drop often fails. */
export function useDayTaskDrag(
  onDrop: (taskId: string, dayKey: string, insertBeforeTaskId: string | null) => void,
  onTap?: (taskId: string) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragSourceDay, setDragSourceDay] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);
  const [dropInsertBeforeId, setDropInsertBeforeId] = useState<string | null>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  const releaseSession = useCallback((s: DragSession) => {
    if (s.el) {
      s.el.style.pointerEvents = '';
      s.el.style.display = '';
      try {
        s.el.releasePointerCapture(s.pointerId);
      } catch {
        /* capture may already be released */
      }
    }
    if (s.ghost) dismissGhost(s.ghost);
    clearDropChrome();
    sessionRef.current = null;
    setDraggingId(null);
    setDragSourceDay(null);
    setDropDay(null);
    setDropInsertBeforeId(null);
    setDragSelectLock(false);
    document.body.style.cursor = '';
    clearTextSelection();
  }, []);

  const cleanup = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    releaseSession(s);
  }, [releaseSession]);

  const onPointerDragStart = useCallback((taskId: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    clearTextSelection();
    setDragSelectLock(true);

    const el = e.currentTarget as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const rect = el.getBoundingClientRect();
    sessionRef.current = {
      taskId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      el,
      ghost: null,
      active: false,
    };
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;

      if (!s.active) {
        const dist = Math.hypot(e.clientX - s.startX, e.clientY - s.startY);
        if (dist < DRAG_THRESHOLD_PX) return;

        s.active = true;
        clearTextSelection();
        s.el.style.pointerEvents = 'none';
        s.ghost = createGhost(s.el);
        s.el.style.display = 'none';
        moveGhost(s.ghost, e.clientX, e.clientY, s.offsetX, s.offsetY);
        setDraggingId(s.taskId);
        setDragSourceDay(s.el.closest('[data-day-key]')?.getAttribute('data-day-key') ?? null);
        document.body.style.cursor = 'grabbing';
      }

      if (s.ghost) moveGhost(s.ghost, e.clientX, e.clientY, s.offsetX, s.offsetY);
      const { dayKey, insertBeforeTaskId } = hitTestAt(e.clientX, e.clientY, s.taskId);
      syncDropChrome(dayKey);
      setDropDay(dayKey);
      setDropInsertBeforeId(insertBeforeTaskId);
    };

    const onUp = (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      const wasActive = s.active;
      const taskId = s.taskId;

      if (!wasActive) {
        cleanup();
        onTapRef.current?.(taskId);
        return;
      }

      const { dayKey, insertBeforeTaskId } = hitTestAt(e.clientX, e.clientY, s.taskId);
      if (dayKey) onDropRef.current(s.taskId, dayKey, insertBeforeTaskId);
      releaseSession(s);
    };

    const onSelectStart = (e: Event) => {
      if (sessionRef.current) e.preventDefault();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    document.addEventListener('selectstart', onSelectStart);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.removeEventListener('selectstart', onSelectStart);
    };
  }, [cleanup, releaseSession]);

  return {
    draggingId,
    dragSourceDay,
    dropDay,
    dropInsertBeforeId,
    onPointerDragStart,
  };
}
