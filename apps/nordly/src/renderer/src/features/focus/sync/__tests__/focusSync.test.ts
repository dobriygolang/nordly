import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  end: vi.fn(),
  getLocal: vi.fn(),
  getServerId: vi.fn(),
  putLocal: vi.fn(),
  removeForEntity: vi.fn(),
  setServerId: vi.fn(),
}));

vi.mock('@shared/db/nordlyDb', () => ({
  requireUserId: () => 'user-1',
}));
vi.mock('@features/focus/remote/focusRemote', () => ({
  remoteStartFocusSession: mocks.start,
  remoteEndFocusSession: mocks.end,
}));
vi.mock('@features/focus/repository/focusStore', () => ({
  focusStoreGet: mocks.getLocal,
  focusStorePut: mocks.putLocal,
  focusStoreUnsynced: vi.fn(async () => []),
}));
vi.mock('@shared/sync/idMap', () => ({
  getServerId: mocks.getServerId,
  setServerId: mocks.setServerId,
}));
vi.mock('@shared/sync/outbox', () => ({
  enqueueOutboxOnce: vi.fn(),
  hasOutboxForEntity: vi.fn(),
  removeOutboxForEntity: mocks.removeForEntity,
}));

import { pushFocusOutbox } from '../focusSync';

const entry = {
  id: 'outbox-1',
  userId: 'user-1',
  domain: 'focus' as const,
  op: 'session_end' as const,
  entityId: 'local-1',
  payload: {
    pomodorosCompleted: 1,
    secondsFocused: 120,
    endedAt: '2026-07-15T08:02:00.000Z',
  },
  createdAt: 1,
  attempts: 0,
};

describe('focus end sync idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerId.mockResolvedValue('server-1');
  });

  it('removes every duplicate end entry after one successful end', async () => {
    mocks.getLocal.mockResolvedValue({ ...entry, synced: false });
    mocks.end.mockResolvedValue({ id: 'server-1' });

    await pushFocusOutbox(entry);

    expect(mocks.end).toHaveBeenCalledTimes(1);
    expect(mocks.end).toHaveBeenCalledWith(expect.objectContaining({
      endedAt: '2026-07-15T08:02:00.000Z',
    }));
    expect(mocks.putLocal).toHaveBeenCalledWith(expect.objectContaining({ synced: true }));
    expect(mocks.removeForEntity).toHaveBeenCalledWith(
      'focus',
      'local-1',
      'session_end',
      'user-1',
    );
  });

  it('does not re-end a session already confirmed locally', async () => {
    mocks.getLocal.mockResolvedValue({ ...entry, synced: true });

    await pushFocusOutbox(entry);

    expect(mocks.end).not.toHaveBeenCalled();
    expect(mocks.removeForEntity).toHaveBeenCalledTimes(1);
  });
});

describe('focus start sync idempotency', () => {
  it('sends the local id and offline start timestamp', async () => {
    mocks.getServerId.mockResolvedValue(null);
    mocks.start.mockResolvedValue({ id: 'server-1' });
    mocks.getLocal.mockResolvedValue(null);

    await pushFocusOutbox({
      ...entry,
      op: 'session_start',
      payload: {
        planItemId: '',
        pinnedTitle: 'Offline focus',
        mode: 'pomodoro',
        clientSessionId: 'local-1',
        startedAt: '2026-07-15T08:00:00.000Z',
      },
    });

    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({
      clientSessionId: 'local-1',
      startedAt: '2026-07-15T08:00:00.000Z',
    }));
    expect(mocks.setServerId).toHaveBeenCalledWith('focus', 'local-1', 'server-1', 'user-1');
  });
});
