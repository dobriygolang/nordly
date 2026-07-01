/** Local-first epic accent colors — device-only until server epic sync ships. */

import type { TaskCard } from '../api/tasks';

/** Fixed palette — no names, no backend. */
export const TASK_EPIC_PALETTE = [
  '#5b8def',
  '#4cb35c',
  '#c084fc',
  '#f59e0b',
] as const;

export type TaskEpicColor = (typeof TASK_EPIC_PALETTE)[number];

const PALETTE_SET = new Set<string>(TASK_EPIC_PALETTE);

export function isTaskEpicColor(color: string): color is TaskEpicColor {
  return PALETTE_SET.has(color);
}

export function taskEpicColor(task: Pick<TaskCard, 'epicColor'>): string | null {
  const color = task.epicColor;
  if (!color) return null;
  return isTaskEpicColor(color) ? color : null;
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return null;
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}

/** Inline epic tint for calendar/timeline blocks — avoids color-mix gaps in WKWebView. */
export function epicTimelineSurfaceStyle(
  color: string,
  opts?: { done?: boolean; dragging?: boolean },
): Record<string, string> {
  const rgb = parseHexColor(color);
  if (!rgb) return { '--task-epic-color': color };
  const { r, g, b } = rgb;
  const accent = `inset 3px 0 0 ${opts?.done ? `rgba(${r}, ${g}, ${b}, 0.4)` : color}`;
  const dragLift = opts?.dragging ? ', 0 8px 24px rgb(0 0 0 / 0.5)' : '';
  if (opts?.done) {
    return {
      '--task-epic-color': color,
      boxShadow: accent + dragLift,
    };
  }
  return {
    '--task-epic-color': color,
    background: `rgba(${r}, ${g}, ${b}, 0.34)`,
    border: `1px solid rgba(${r}, ${g}, ${b}, 0.52)`,
    boxShadow: accent + dragLift,
  };
}

/** Calendar entry chip/block styling from a task epic color. */
export function epicEntrySurface(
  epicColor: string | null | undefined,
  opts?: { done?: boolean; dragging?: boolean },
): Record<string, string> | null {
  if (!epicColor) return null;
  return epicTimelineSurfaceStyle(epicColor, opts);
}
