import { useEffect } from 'react';

import type { PageId } from '@shared/model/navigation';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import type { PomodoroStartArgs } from '@shared/model/pomodoro';

export type DeepLinkAction =
  | { kind: 'focus'; args: PomodoroStartArgs }
  | { kind: 'task'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'settings'; googleStatus: string | null; zoomStatus: string | null; detail: string | null };

export function parseDeepLink(url: string): DeepLinkAction | null {
  const parsed = new URL(url);
  const host = parsed.host.toLowerCase();

  if (host === 'focus' || host === 'focus.start') {
    return {
      kind: 'focus',
      args: {
        planItemId: parsed.searchParams.get('task') ?? undefined,
        pinnedTitle: parsed.searchParams.get('title') ?? undefined,
      },
    };
  }
  if (host === 'task.open') {
    const id = parsed.searchParams.get('id');
    return id ? { kind: 'task', id } : null;
  }
  if (host === 'note.open') {
    const id = parsed.searchParams.get('id');
    return id ? { kind: 'note', id } : null;
  }
  if (host === 'settings') {
    return {
      kind: 'settings',
      googleStatus: parsed.searchParams.get('google_calendar'),
      zoomStatus: parsed.searchParams.get('zoom'),
      detail: parsed.searchParams.get('detail'),
    };
  }
  return null;
}

export interface DeepLinkNavigationHandlers {
  navigateTo: (page: PageId) => void;
  beforeNavigate: (page: PageId) => Promise<boolean>;
  openTask: (id: string) => void;
  openNote: (id: string) => void;
  startFocus: (args: PomodoroStartArgs) => void;
  onError: (error: unknown) => void;
}

export async function executeDeepLink(
  action: DeepLinkAction,
  handlers: DeepLinkNavigationHandlers,
): Promise<void> {
  if (action.kind === 'focus') {
    if (!(await handlers.beforeNavigate('home'))) return;
    handlers.startFocus(action.args);
    return;
  }
  if (action.kind === 'task') {
    if (!(await handlers.beforeNavigate('today'))) return;
    handlers.openTask(action.id);
    return;
  }
  if (action.kind === 'note') {
    if (!(await handlers.beforeNavigate('notes'))) return;
    handlers.openNote(action.id);
    return;
  }

  if (!(await handlers.beforeNavigate('settings'))) return;
  if (action.googleStatus) {
    window.dispatchEvent(
      new CustomEvent(NORDLY_EVENTS.googleCalendarOAuth, {
        detail: { status: action.googleStatus, detail: action.detail },
      }),
    );
  }
  if (action.zoomStatus) {
    window.dispatchEvent(
      new CustomEvent(NORDLY_EVENTS.zoomOAuth, {
        detail: { status: action.zoomStatus, detail: action.detail },
      }),
    );
  }
  handlers.navigateTo('settings');
}

export function useDeepLinkNavigation({
  navigateTo,
  beforeNavigate,
  openTask,
  openNote,
  startFocus,
  onError,
}: DeepLinkNavigationHandlers): void {
  useEffect(() => {
    const bridge = window.nordly;
    if (!bridge) return;

    const handle = async (url: string): Promise<void> => {
      let action: DeepLinkAction | null;
      try {
        action = parseDeepLink(url);
      } catch (err) {
        console.warn('[deepLink] invalid url', url, err);
        return;
      }
      if (!action) return;
      await executeDeepLink(action, {
        navigateTo,
        beforeNavigate,
        openTask,
        openNote,
        startFocus,
        onError,
      });
    };

    const run = (url: string): void => {
      void handle(url).catch(onError);
    };
    const offDeepLink = bridge.on('deepLink', ({ url }) => run(url));
    void bridge.deepLink?.initial?.().then((url) => {
      if (url) run(url);
    }).catch(onError);

    return offDeepLink;
  }, [navigateTo, beforeNavigate, openTask, openNote, startFocus, onError]);
}
