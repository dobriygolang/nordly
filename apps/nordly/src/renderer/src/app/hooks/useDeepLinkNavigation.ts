import { useEffect, useRef } from 'react';

import { PageId } from '@shared/model/navigation';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import {
  integrationOAuthMailbox,
  type IntegrationOAuthEvent,
} from '@shared/lib/integrationOAuthMailbox';
import { sanitizeOAuthStatus, type OAuthStatus } from '@shared/model/oauth';
import type { PomodoroStartArgs } from '@shared/model/pomodoro';

export const DeepLinkKind = {
  Focus: 'focus',
  Task: 'task',
  Note: 'note',
  Settings: 'settings',
} as const;
export type DeepLinkKind = (typeof DeepLinkKind)[keyof typeof DeepLinkKind];

const DeepLinkHost = {
  Focus: 'focus',
  FocusStart: 'focus.start',
  TaskOpen: 'task.open',
  NoteOpen: 'note.open',
  Settings: 'settings',
} as const;

export type DeepLinkAction =
  | { kind: typeof DeepLinkKind.Focus; args: PomodoroStartArgs }
  | { kind: typeof DeepLinkKind.Task; id: string }
  | { kind: typeof DeepLinkKind.Note; id: string }
  | {
      kind: typeof DeepLinkKind.Settings;
      googleStatus: OAuthStatus | null;
      zoomStatus: OAuthStatus | null;
      detail: string | null;
    };

const OAUTH_DETAIL_RE = /^[a-zA-Z0-9._-]{1,200}$/;
const ENTITY_ID_RE = /^[a-zA-Z0-9._:-]{1,200}$/;
const DEEP_LINK_DEDUPE_MS = 10_000;

function sanitizeOAuthDetail(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  return OAUTH_DETAIL_RE.test(value) ? value : null;
}

function sanitizeFocusTitle(raw: string | null): string | undefined {
  if (raw === null) return undefined;
  const value = raw.trim();
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint < 32 || codePoint === 127;
  });
  if (!value || value.length > 200 || hasControlCharacter) {
    return undefined;
  }
  return value;
}

export function parseDeepLink(url: string): DeepLinkAction | null {
  const parsed = new URL(url);
  if (parsed.protocol !== 'nordly:') return null;
  const host = parsed.host.toLowerCase();

  if (host === DeepLinkHost.Focus || host === DeepLinkHost.FocusStart) {
    const taskId = parsed.searchParams.get('task');
    return {
      kind: DeepLinkKind.Focus,
      args: {
        planItemId: taskId && ENTITY_ID_RE.test(taskId) ? taskId : undefined,
        pinnedTitle: sanitizeFocusTitle(parsed.searchParams.get('title')),
      },
    };
  }
  if (host === DeepLinkHost.TaskOpen) {
    const id = parsed.searchParams.get('id');
    return id && ENTITY_ID_RE.test(id) ? { kind: DeepLinkKind.Task, id } : null;
  }
  if (host === DeepLinkHost.NoteOpen) {
    const id = parsed.searchParams.get('id');
    return id && ENTITY_ID_RE.test(id) ? { kind: DeepLinkKind.Note, id } : null;
  }
  if (host === DeepLinkHost.Settings) {
    return {
      kind: DeepLinkKind.Settings,
      googleStatus: sanitizeOAuthStatus(parsed.searchParams.get('google_calendar')),
      zoomStatus: sanitizeOAuthStatus(parsed.searchParams.get('zoom')),
      detail: sanitizeOAuthDetail(parsed.searchParams.get('detail')),
    };
  }
  return null;
}

export interface DeepLinkNavigationHandlers {
  navigateTo: (page: PageId) => Promise<boolean>;
  openTask: (id: string) => Promise<boolean>;
  openNote: (id: string) => Promise<boolean>;
  startFocus: (args: PomodoroStartArgs) => Promise<boolean>;
  onError: (error: unknown) => void;
}

export class DeepLinkNavigationError extends Error {
  constructor(kind: DeepLinkAction['kind']) {
    super(`Deep link ${kind} navigation was blocked`);
    this.name = 'DeepLinkNavigationError';
  }
}

async function runNavigation(
  action: DeepLinkAction,
  navigate: () => Promise<boolean>,
  onError: (error: unknown) => void,
): Promise<boolean> {
  try {
    if (await navigate()) return true;
    onError(new DeepLinkNavigationError(action.kind));
  } catch (error) {
    onError(error);
  }
  return false;
}

function publishOAuthResult(
  event: IntegrationOAuthEvent,
  status: OAuthStatus,
  detail: string | null,
): void {
  const result = { status, detail };
  integrationOAuthMailbox.publish(event, result);
  window.dispatchEvent(new CustomEvent(event, { detail: result }));
}

export async function executeDeepLink(
  action: DeepLinkAction,
  handlers: DeepLinkNavigationHandlers,
): Promise<void> {
  if (action.kind === DeepLinkKind.Focus) {
    await runNavigation(action, () => handlers.startFocus(action.args), handlers.onError);
    return;
  }
  if (action.kind === DeepLinkKind.Task) {
    await runNavigation(action, () => handlers.openTask(action.id), handlers.onError);
    return;
  }
  if (action.kind === DeepLinkKind.Note) {
    await runNavigation(action, () => handlers.openNote(action.id), handlers.onError);
    return;
  }

  if (
    !(await runNavigation(action, () => handlers.navigateTo(PageId.Settings), handlers.onError))
  ) {
    return;
  }
  if (action.googleStatus) {
    publishOAuthResult(
      NORDLY_EVENTS.googleCalendarOAuth,
      action.googleStatus,
      action.detail,
    );
  }
  if (action.zoomStatus) {
    publishOAuthResult(NORDLY_EVENTS.zoomOAuth, action.zoomStatus, action.detail);
  }
}

export async function handleDeepLinkUrl(
  url: string,
  handlers: DeepLinkNavigationHandlers,
  handledUrls: Map<string, number>,
  now = Date.now(),
): Promise<void> {
  const key = url.trim();
  const lastHandledAt = handledUrls.get(key);
  if (
    lastHandledAt !== undefined &&
    now - lastHandledAt < DEEP_LINK_DEDUPE_MS
  ) {
    return;
  }
  handledUrls.set(key, now);
  for (const [handledUrl, handledAt] of handledUrls) {
    if (now - handledAt >= DEEP_LINK_DEDUPE_MS) handledUrls.delete(handledUrl);
  }

  try {
    const action = parseDeepLink(key);
    if (action) await executeDeepLink(action, handlers);
  } catch (error) {
    handlers.onError(error);
  }
}

export function useDeepLinkNavigation({
  navigateTo,
  openTask,
  openNote,
  startFocus,
  onError,
}: DeepLinkNavigationHandlers): void {
  const handledUrlsRef = useRef(new Map<string, number>());

  useEffect(() => {
    const bridge = window.nordly;
    if (!bridge) return;

    const handlers: DeepLinkNavigationHandlers = {
      navigateTo,
      openTask,
      openNote,
      startFocus,
      onError,
    };
    let active = true;
    const run = (url: string): void => {
      if (!active) return;
      void handleDeepLinkUrl(url, handlers, handledUrlsRef.current).catch(onError);
    };
    const offDeepLink = bridge.on('deepLink', ({ url }) => run(url));
    void bridge.deepLink
      ?.initial?.()
      .then((url) => {
        if (url) run(url);
      })
      .catch((error: unknown) => {
        if (active) onError(error);
      });

    return () => {
      active = false;
      offDeepLink();
    };
  }, [navigateTo, openTask, openNote, startFocus, onError]);
}
