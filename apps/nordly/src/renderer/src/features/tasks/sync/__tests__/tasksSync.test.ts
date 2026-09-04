import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OutboxOp, SyncDomain, type OutboxEntry } from '@shared/sync/types';

const mocks = vi.hoisted(() => ({
  getServerId: vi.fn(),
  patch: vi.fn(),
  removeOutbox: vi.fn(),
}));

vi.mock('@shared/db/nordlyDb', () => ({
  requireUserId: () => 'user-1',
}));
vi.mock('@features/tasks/api/epics', () => ({
  isOfflineEpicId: vi.fn(() => false),
  pullEpicsCache: vi.fn(async () => []),
}));
vi.mock('@features/tasks/remote/tasksRemote', () => ({
  remoteCreateTask: vi.fn(),
  remoteDeleteTask: vi.fn(),
  remoteListTasks: vi.fn(),
  remoteMoveTaskStatus: vi.fn(),
  remotePatchTask: mocks.patch,
  remoteScheduleTask: vi.fn(),
}));
vi.mock('@features/tasks/repository/tasksStore', () => ({
  tasksStoreApplyRemoteAbsences: vi.fn(),
  tasksStoreGet: vi.fn(),
  tasksStoreMergeRemote: vi.fn(),
  tasksStoreReplaceId: vi.fn(),
  reconcileTasksStore: vi.fn(),
}));
vi.mock('@shared/sync/idMap', () => ({
  getServerId: mocks.getServerId,
  setServerId: vi.fn(),
}));
vi.mock('@shared/sync/outbox', () => ({
  listOutbox: vi.fn(async () => []),
  removeOutbox: mocks.removeOutbox,
}));

import { pushTasksOutbox } from '../tasksSync';

function corruptTaskEntry(
  op: string,
  payload: Record<string, unknown>,
): OutboxEntry {
  return {
    id: 'outbox-1',
    userId: 'user-1',
    domain: SyncDomain.Tasks,
    op,
    entityId: 'task-1',
    payload,
    createdAt: 1,
    attempts: 0,
  } as unknown as OutboxEntry;
}

describe('tasks patch outbox validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getServerId.mockResolvedValue('server-1');
  });

  it('rejects an empty patch instead of sending an empty remote request', async () => {
    await expect(
      pushTasksOutbox(corruptTaskEntry(OutboxOp.Patch, {})),
    ).rejects.toThrow(
      'Invalid tasks patch outbox (outbox-1): empty patch',
    );

    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.removeOutbox).not.toHaveBeenCalled();
  });

  it('rejects the removed unschedule operation', async () => {
    await expect(
      pushTasksOutbox(corruptTaskEntry('unschedule', {})),
    ).rejects.toThrow('Unsupported tasks outbox operation: unschedule');
  });

  it('keeps malformed schedule entries visible for retry and diagnosis', async () => {
    await expect(
      pushTasksOutbox(
        corruptTaskEntry(OutboxOp.Schedule, { durationMin: 30 }),
      ),
    ).rejects.toThrow(
      'Invalid tasks schedule outbox (outbox-1): missing startIso',
    );
    expect(mocks.removeOutbox).not.toHaveBeenCalled();
  });

  it('rejects a Google event id without its calendar id', async () => {
    await expect(
      pushTasksOutbox(
        corruptTaskEntry(OutboxOp.Patch, { googleEventId: 'evt-1' }),
      ),
    ).rejects.toThrow(
      'Invalid tasks patch outbox (outbox-1): googleEventId and googleCalendarId must be set together',
    );
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it('sends googleEventId and googleCalendarId together', async () => {
    mocks.patch.mockResolvedValue({ id: 'server-1' });
    await pushTasksOutbox(
      corruptTaskEntry(OutboxOp.Patch, {
        googleEventId: 'evt-1',
        googleCalendarId: 'work@group.calendar.google.com',
      }),
    );
    expect(mocks.patch).toHaveBeenCalledWith('server-1', {
      googleEventId: 'evt-1',
      googleCalendarId: 'work@group.calendar.google.com',
    });
  });
});
