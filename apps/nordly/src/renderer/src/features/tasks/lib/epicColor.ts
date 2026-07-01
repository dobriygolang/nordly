/** Epic color resolution — server epicId + offline epicColor fallback. */

import type { TaskEpic } from '../api/epics';
import type { TaskCard } from '../api/tasks';

export const TASK_EPIC_PALETTE = [
  '#5b8def',
  '#4cb35c',
  '#c084fc',
  '#f59e0b',
] as const;

export type TaskEpicColor = (typeof TASK_EPIC_PALETTE)[number];

const PALETTE_SET = new Set<string>(TASK_EPIC_PALETTE.map(normalizeHex));

export function normalizeHex(hex: string): string {
  const raw = hex.trim().toLowerCase();
  return raw.startsWith('#') ? raw : `#${raw}`;
}

export function isTaskEpicColor(color: string): boolean {
  return PALETTE_SET.has(normalizeHex(color));
}

export function findEpicByColor(epics: TaskEpic[], color: string): TaskEpic | undefined {
  const want = normalizeHex(color);
  return epics.find((e) => normalizeHex(e.color) === want);
}

/** Display color: epicId → cached epic, else offline epicColor. */
export function resolveTaskEpicColor(
  task: Pick<TaskCard, 'epicId' | 'epicColor'>,
  epics: TaskEpic[] = [],
): string | null {
  if (task.epicId) {
    const epic = epics.find((e) => e.id === task.epicId);
    if (epic) return normalizeHex(epic.color);
  }
  if (task.epicColor) return normalizeHex(task.epicColor);
  return null;
}

/** @deprecated Use resolveTaskEpicColor(task, epics) */
export function taskEpicColor(task: Pick<TaskCard, 'epicId' | 'epicColor'>, epics: TaskEpic[] = []): string | null {
  return resolveTaskEpicColor(task, epics);
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const raw = normalizeHex(hex).slice(1);
  if (!/^[0-9a-f]{6}$/i.test(raw)) return null;
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}

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

export function epicEntrySurface(
  epicColor: string | null | undefined,
  opts?: { done?: boolean; dragging?: boolean },
): Record<string, string> | null {
  if (!epicColor) return null;
  return epicTimelineSurfaceStyle(epicColor, opts);
}

export function isEpicActive(task: Pick<TaskCard, 'epicId' | 'epicColor'>, epic: TaskEpic): boolean {
  if (task.epicId) return task.epicId === epic.id;
  if (task.epicColor) return normalizeHex(task.epicColor) === normalizeHex(epic.color);
  return false;
}

export function taskHasEpic(task: Pick<TaskCard, 'epicId' | 'epicColor'>): boolean {
  return Boolean(task.epicId || task.epicColor);
}
