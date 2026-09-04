import { describe, expect, it } from 'vitest';

import {
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  clampScheduleToDayGrid,
  eventBlockLayout,
  layoutTimedEntriesForDay,
  tasksPlannedForDayGrid,
  type CalendarEntry,
} from '../events';
import {
  applyTimeFromDay,
  parseDayKey,
  scheduleStartISO,
  toDayKey,
} from '@shared/lib/dates';

describe('move Fri→Thu timeline visibility', () => {
  const thuKey = '2026-07-30';
  const thu = parseDayKey(thuKey);

  function movedTask(hour: number, minute = 0) {
    const existing = new Date(2026, 6, 31, hour, minute);
    const moved = applyTimeFromDay(thu, existing);
    const iso = scheduleStartISO(moved);
    return {
      task: {
        id: 't1',
        title: `${hour}:${minute}`,
        status: 'todo' as const,
        kind: 'custom' as const,
        createdAt: iso,
        updatedAt: iso,
        scheduledStart: iso,
        scheduledDurationMin: 30,
      },
      moved,
    };
  }

  function layoutFor(task: ReturnType<typeof movedTask>['task']) {
    const planned = tasksPlannedForDayGrid(thuKey, [task]);
    const entries: CalendarEntry[] = planned.map((b) => ({
      id: `task:${b.task.id}`,
      source: 'task',
      title: b.task.title,
      start: b.start,
      end: b.end,
      allDay: false,
      taskId: b.task.id,
    }));
    return {
      planned,
      layout: layoutTimedEntriesForDay(
        entries,
        40,
        CALENDAR_GRID_START_HOUR,
        CALENDAR_GRID_END_HOUR,
        thuKey,
      ),
      block: entries[0]
        ? eventBlockLayout(
            entries[0],
            40,
            CALENDAR_GRID_START_HOUR,
            CALENDAR_GRID_END_HOUR,
            thuKey,
          )
        : null,
    };
  }

  it('keeps daytime moves visible on the Thursday grid', () => {
    for (const hour of [6, 9, 14, 22, 23]) {
      const { task, moved } = movedTask(hour);
      expect(toDayKey(moved)).toBe(thuKey);
      const { planned, layout, block } = layoutFor(task);
      expect(planned).toHaveLength(1);
      expect(block).not.toBeNull();
      expect(layout).toHaveLength(1);
    }
  });

  it('snaps early-morning moves into the visible daytime grid', () => {
    const raw = applyTimeFromDay(thu, new Date(2026, 6, 31, 1, 0));
    expect(raw.getHours()).toBe(1);
    const clamped = clampScheduleToDayGrid(thuKey, raw, new Date(2026, 6, 30, 15, 0));
    expect(toDayKey(clamped)).toBe(thuKey);
    expect(clamped.getHours()).toBe(15);
  });

  it('does not invent a stub for same-day pre-grid hours already stored', () => {
    const { task } = movedTask(3);
    const { planned, block, layout } = layoutFor(task);
    expect(planned).toHaveLength(1);
    expect(block).toBeNull();
    expect(layout).toHaveLength(0);
  });

  it('does not double-paint overnight clock times on both adjacent days', () => {
    const iso = scheduleStartISO(new Date(2026, 6, 31, 1, 0)); // Fri 01:00
    const task = {
      id: 't-overnight',
      title: 'spill',
      status: 'todo' as const,
      kind: 'custom' as const,
      createdAt: iso,
      updatedAt: iso,
      scheduledStart: iso,
      scheduledDurationMin: 30,
    };
    const thuGrid = tasksPlannedForDayGrid('2026-07-30', [task]);
    const friGrid = tasksPlannedForDayGrid('2026-07-31', [task]);
    expect(thuGrid.map((b) => b.task.id)).toEqual(['t-overnight']);
    expect(friGrid.map((b) => b.task.id)).toEqual([]);
  });
});
