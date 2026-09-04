import { describe, expect, it, vi } from 'vitest';

import {
  DeepLinkNavigationError,
  executeDeepLink,
  handleDeepLinkUrl,
  parseDeepLink,
  type DeepLinkNavigationHandlers,
} from '../useDeepLinkNavigation';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { integrationOAuthMailbox } from '@shared/lib/integrationOAuthMailbox';

describe('parseDeepLink', () => {
  it('parses canonical task and note requests', () => {
    expect(parseDeepLink('nordly://task.open?id=task-1')).toEqual({
      kind: 'task',
      id: 'task-1',
    });
    expect(parseDeepLink('nordly://note.open?id=note-1')).toEqual({
      kind: 'note',
      id: 'note-1',
    });
  });

  it('rejects entity links without an id', () => {
    expect(parseDeepLink('nordly://task.open')).toBeNull();
    expect(parseDeepLink('nordly://note.open')).toBeNull();
  });

  it('does not accept legacy entity hosts', () => {
    expect(parseDeepLink('nordly://task?id=task-1')).toBeNull();
    expect(parseDeepLink('nordly://note?id=note-1')).toBeNull();
  });

  it('rejects non-app schemes, malformed URLs, and unsafe entity ids', () => {
    expect(parseDeepLink('https://task.open?id=task-1')).toBeNull();
    expect(() => parseDeepLink('not a url')).toThrow();
    expect(parseDeepLink('nordly://task.open?id=%3Cscript%3E')).toBeNull();
  });

  it('sanitizes optional focus context', () => {
    expect(
      parseDeepLink('nordly://focus.start?task=%3Cbad%3E&title=%00unsafe'),
    ).toEqual({
      kind: 'focus',
      args: {
        planItemId: undefined,
        pinnedTitle: undefined,
      },
    });
  });

  it('allowlists OAuth status and strips unsafe detail', () => {
    expect(
      parseDeepLink('nordly://settings?google_calendar=connected&detail=save_failed'),
    ).toEqual({
      kind: 'settings',
      googleStatus: 'connected',
      zoomStatus: null,
      detail: 'save_failed',
    });
    expect(
      parseDeepLink(
        'nordly://settings?zoom=error&detail=%3Cscript%3Ealert(1)%3C/script%3E',
      ),
    ).toEqual({
      kind: 'settings',
      googleStatus: null,
      zoomStatus: 'error',
      detail: null,
    });
    expect(
      parseDeepLink('nordly://settings?google_calendar=javascript:alert(1)'),
    ).toEqual({
      kind: 'settings',
      googleStatus: null,
      zoomStatus: null,
      detail: null,
    });
  });
});

describe('executeDeepLink', () => {
  function handlers(
    overrides: Partial<DeepLinkNavigationHandlers> = {},
  ): DeepLinkNavigationHandlers {
    return {
      navigateTo: vi.fn(async () => true),
      openTask: vi.fn(async () => true),
      openNote: vi.fn(async () => true),
      startFocus: vi.fn(async () => true),
      onError: vi.fn(),
      ...overrides,
    };
  }

  it('awaits the task navigation and performs its flush once', async () => {
    let release!: (saved: boolean) => void;
    const gate = new Promise<boolean>((resolve) => {
      release = resolve;
    });
    const flush = vi.fn(() => gate);
    const actions = handlers({
      openTask: vi.fn(async () => flush()),
    });

    const pending = executeDeepLink({ kind: 'task', id: 'task-1' }, actions);
    expect(actions.openTask).toHaveBeenCalledWith('task-1');
    expect(flush).toHaveBeenCalledTimes(1);

    release(true);
    await pending;
    expect(actions.onError).not.toHaveBeenCalled();
  });

  it('reports a blocked page flush', async () => {
    const actions = handlers({
      openTask: vi.fn(async () => false),
    });

    await executeDeepLink({ kind: 'task', id: 'task-1' }, actions);

    expect(actions.onError).toHaveBeenCalledTimes(1);
    expect(actions.onError).toHaveBeenCalledWith(expect.any(DeepLinkNavigationError));
  });

  it('navigates before publishing a durable OAuth result', async () => {
    const order: string[] = [];
    const receive = vi.fn(() => order.push('publish'));
    const unsubscribe = integrationOAuthMailbox.subscribe(
      NORDLY_EVENTS.googleCalendarOAuth,
      receive,
    );
    const actions = handlers({
      navigateTo: vi.fn(async () => {
        order.push('navigate');
        return true;
      }),
    });

    await executeDeepLink(
      {
        kind: 'settings',
        googleStatus: 'connected',
        zoomStatus: null,
        detail: null,
      },
      actions,
    );

    expect(actions.navigateTo).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['navigate', 'publish']);
    expect(receive).toHaveBeenCalledWith({ status: 'connected', detail: null });
    unsubscribe();
  });

  it('deduplicates the same cold and warm URL', async () => {
    const actions = handlers();
    const handled = new Map<string, number>();
    const url = 'nordly://note.open?id=note-1';

    await Promise.all([
      handleDeepLinkUrl(url, actions, handled, 1_000),
      handleDeepLinkUrl(url, actions, handled, 1_000),
    ]);

    expect(actions.openNote).toHaveBeenCalledTimes(1);
  });

  it('reports malformed URLs through onError once', async () => {
    const actions = handlers();
    const handled = new Map<string, number>();

    await handleDeepLinkUrl('not a URL', actions, handled, 1_000);
    await handleDeepLinkUrl('not a URL', actions, handled, 1_000);

    expect(actions.onError).toHaveBeenCalledTimes(1);
  });
});
