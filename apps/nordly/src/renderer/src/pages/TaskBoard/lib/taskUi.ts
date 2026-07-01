/** Task board UI helpers — epic colors, conference display. */

export interface TaskEpic {
  id: string;
  name: string;
  color: string;
}

export function epicById(epics: TaskEpic[], id: string | null | undefined): TaskEpic | null {
  if (!id) return null;
  return epics.find((e) => e.id === id) ?? null;
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

/** Inline epic tint for timeline blocks — avoids color-mix gaps in WKWebView. */
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

export function conferenceProvider(
  url: string | null | undefined,
  provider?: string | null,
): 'meet' | 'zoom' | 'other' | null {
  if (provider === 'meet' || provider === 'zoom') return provider;
  if (!url) return null;
  if (/meet\.google\.com/i.test(url)) return 'meet';
  if (/zoom\.us/i.test(url)) return 'zoom';
  return 'other';
}

/** Short display for generated meeting links in the popover. */
export function conferenceDisplay(url: string): string {
  try {
    const u = new URL(url);
    if (/meet\.google\.com/i.test(u.hostname)) {
      return u.pathname.replace(/^\//, '');
    }
    if (/zoom\.us/i.test(u.hostname)) {
      return `j/${u.pathname.split('/').pop() ?? ''}`;
    }
    return u.hostname;
  } catch {
    return url;
  }
}
