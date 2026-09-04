import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  endSession: vi.fn(),
  getOpenSession: vi.fn(),
  startSession: vi.fn(),
  notify: vi.fn(async () => undefined),
  complete: vi.fn(),
  hydrate: vi.fn(),
  state: {
    remain: 0,
    durationSec: 1_500,
    mode: 'pomodoro' as const,
    elapsed: 0,
    pinnedPlanItemId: null,
    pinnedTitle: null,
  },
}));

vi.mock('@nordly-i18n', () => ({
  translate: (key: string) => key,
}));
vi.mock('@features/focus/api/focusClient', () => ({
  endFocusSession: mocks.endSession,
  getOpenFocusSession: mocks.getOpenSession,
  startFocusSession: mocks.startSession,
}));
vi.mock('@shared/api/notifications', () => ({
  notify: mocks.notify,
}));
vi.mock('@shared/model/settings', () => ({
  readEndBell: () => false,
}));
vi.mock('@shared/model/pomodoro', () => ({
  parseFocusTimerMode: (mode?: string) => mode ?? 'pomodoro',
  usePomodoroStore: {
    getState: () => ({
      ...mocks.state,
      complete: mocks.complete,
      hydrate: mocks.hydrate,
    }),
  },
}));

import {
  completePomodoroTimer,
  FocusSessionTransitionQueue,
  shouldApplyPersistedSnapshot,
} from '../pomodoroSession';

describe('Pomodoro snapshot freshness', () => {
  it('rejects a snapshot older than a local mutation', () => {
    expect(
      shouldApplyPersistedSnapshot(
        { savedAt: 99 },
        {
          requestedAtVersion: 2,
          currentVersion: 2,
          lastMutationAt: 100,
        },
      ),
    ).toBe(false);
  });

  it('rejects a load raced by a newer in-memory version', () => {
    expect(
      shouldApplyPersistedSnapshot(
        { savedAt: 200 },
        {
          requestedAtVersion: 1,
          currentVersion: 2,
          lastMutationAt: 100,
        },
      ),
    ).toBe(false);
  });

  it('uses the known saved version when timestamps match', () => {
    expect(
      shouldApplyPersistedSnapshot(
        { savedAt: 200 },
        {
          requestedAtVersion: 2,
          currentVersion: 2,
          lastMutationAt: 250,
          knownPersistedVersion: { savedAt: 200, version: 2 },
        },
      ),
    ).toBe(true);
    expect(
      shouldApplyPersistedSnapshot(
        { savedAt: 200 },
        {
          requestedAtVersion: 2,
          currentVersion: 2,
          lastMutationAt: 250,
          knownPersistedVersion: { savedAt: 200, version: 1 },
        },
      ),
    ).toBe(false);
  });
});

describe('FocusSessionTransitionQueue', () => {
  it('keeps rapid start, stop, and restart transitions in order', async () => {
    const queue = new FocusSessionTransitionQueue();
    const order: string[] = [];
    let releaseStart!: () => void;

    const start = queue.enqueue(async () => {
      order.push('start');
      await new Promise<void>((resolve) => {
        releaseStart = resolve;
      });
    });
    const stop = queue.enqueue(async () => {
      order.push('stop');
    });
    const restart = queue.enqueue(async () => {
      order.push('restart');
    });

    await vi.waitFor(() => expect(order).toEqual(['start']));
    releaseStart();
    await Promise.all([start, stop, restart]);

    expect(order).toEqual(['start', 'stop', 'restart']);
  });

  it('continues after a failed transition', async () => {
    const queue = new FocusSessionTransitionQueue();
    const failed = queue.enqueue(async () => {
      throw new Error('start failed');
    });
    const recovered = vi.fn();
    const next = queue.enqueue(async () => {
      recovered();
    });

    await expect(failed).rejects.toThrow('start failed');
    await next;
    expect(recovered).toHaveBeenCalledOnce();
  });
});

describe('Pomodoro expiration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('coalesces leader and follower completion for the same session', async () => {
    let releaseEnd!: () => void;
    mocks.endSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseEnd = resolve;
        }),
    );
    const sessionRef = { current: 'session-1' };

    const leader = completePomodoroTimer(sessionRef, 1_500);
    const follower = completePomodoroTimer(sessionRef, 1_500);

    expect(follower).toBe(leader);
    await vi.waitFor(() => expect(mocks.endSession).toHaveBeenCalledTimes(1));
    releaseEnd();
    await Promise.all([leader, follower]);

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.complete).toHaveBeenCalledTimes(1);
  });
});
