/** Task board UI helpers — conference display. Epic colors: `@features/tasks/lib/epicColor`. */

export {
  TASK_EPIC_PALETTE,
  epicEntrySurface,
  epicTimelineSurfaceStyle,
  isEpicActive,
  isTaskEpicColor,
  resolveTaskEpicColor,
  taskHasEpic,
  type TaskEpicColor,
} from '@features/tasks/lib/epicColor';

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
