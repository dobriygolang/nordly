/** Task board UI helpers — conference display. Tag colors: `@features/tasks/lib/epicColor`. */
import {
  ConferenceDisplayProvider,
  ConferenceProvider,
  type ConferenceDisplayProvider as ConferenceDisplayProviderValue,
} from '@features/tasks/model/status';

export {
  TASK_EPIC_PALETTE,
  TAG_COLOR_LABEL_KEYS,
  epicEntrySurface,
  epicTimelineSurfaceStyle,
  isEpicActive,
  isTaskEpicColor,
  resolveTaskEpicColor,
  tagDisplayName,
  taskHasEpic,
  type TaskEpicColor,
} from '@features/tasks/lib/epicColor';

export function conferenceProvider(
  url: string | null | undefined,
  provider?: string | null,
): ConferenceDisplayProviderValue | null {
  if (provider === ConferenceProvider.Meet || provider === ConferenceProvider.Zoom) {
    return provider;
  }
  if (!url) return null;
  if (/meet\.google\.com/i.test(url)) return ConferenceDisplayProvider.Meet;
  if (/zoom\.us/i.test(url)) return ConferenceDisplayProvider.Zoom;
  return ConferenceDisplayProvider.Other;
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
