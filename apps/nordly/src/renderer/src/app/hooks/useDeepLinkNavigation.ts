import { useEffect } from 'react';

import type { PageId } from '@shared/model/navigation';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import type { PomodoroStartArgs } from '@shared/model/pomodoro';

export type DeepLinkAction =
  | { kind: 'focus'; args: PomodoroStartArgs }
  | { kind: 'task'; id: string }
  | { kind: 'note'; id: string }
  | {
      kind: 'settings';
      googleStatus: string | null;
      zoomStatus: string | null;
      detail: string | null;
      code: string | null;
      state: string | null;
    };

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
      code: parsed.searchParams.get('code'),
      state: parsed.searchParams.get('state'),
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

async function exchangeOAuthCode(action: Extract<DeepLinkAction, { kind: 'settings' }>): Promise<void> {
  if (!action.code || !action.state) return;

  const { loadOAuthPending } = await import('@shared/integrations/oauthTokens');
  const [zoomPending, googlePending] = await Promise.all([
    loadOAuthPending('zoom'),
    loadOAuthPending('google'),
  ]);

  if (zoomPending?.state === action.state) {
    const { completeZoomOAuthFromDeepLink } = await import('@features/calendar/local/zoomOAuth');
    await completeZoomOAuthFromDeepLink(action.code, action.state);
    window.dispatchEvent(
      new CustomEvent(NORDLY_EVENTS.zoomOAuth, {
        detail: { status: 'connected', detail: null },
      }),
    );
    return;
  }

  if (googlePending?.state === action.state) {
    const { completeGoogleOAuthFromDeepLink } = await import(
      '@features/calendar/local/googleOAuth'
    );
    await completeGoogleOAuthFromDeepLink(action.code, action.state);
    window.dispatchEvent(
      new CustomEvent(NORDLY_EVENTS.googleCalendarOAuth, {
        detail: { status: 'connected', detail: null },
      }),
    );
    return;
  }

  throw new Error('No matching OAuth pending state for deep-link code');
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

  if (action.code && action.state) {
    try {
      await exchangeOAuthCode(action);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      window.dispatchEvent(
        new CustomEvent(NORDLY_EVENTS.zoomOAuth, {
          detail: { status: 'error', detail },
        }),
      );
      window.dispatchEvent(
        new CustomEvent(NORDLY_EVENTS.googleCalendarOAuth, {
          detail: { status: 'error', detail },
        }),
      );
      handlers.onError(err);
    }
  } else {
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
