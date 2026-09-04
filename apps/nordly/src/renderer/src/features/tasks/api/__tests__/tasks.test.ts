import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TaskCard } from '@features/tasks/api/tasks';
import { ConferenceProvider, TaskKind, TaskStatus } from '@features/tasks/model/status';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

const mocks = vi.hoisted(() => ({
  applyRemote: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  put: vi.fn(),
  putMany: vi.fn(),
  softDelete: vi.fn(),
  epicsList: vi.fn(),
  conference: vi.fn(),
  getServerId: vi.fn(),
  cancelOutbox: vi.fn(),
  enqueueOutbox: vi.fn(),
  flushSync: vi.fn(),
  scheduleSync: vi.fn(),
  syncQueueEnabled: vi.fn(),
  cloudEnabled: vi.fn(),
}));

vi.mock('@features/tasks/repository/tasksStore', () => ({
  tasksStoreApplyRemote: mocks.applyRemote,
  tasksStoreGet: mocks.get,
  tasksStoreList: mocks.list,
  tasksStorePut: mocks.put,
  tasksStorePutMany: mocks.putMany,
  tasksStoreSoftDelete: mocks.softDelete,
}));
vi.mock('@features/tasks/repository/epicsStore', () => ({
  epicsStoreList: mocks.epicsList,
  epicsStoreReplace: vi.fn(),
}));
vi.mock('@features/tasks/remote/tasksRemote', () => ({
  remoteCreateTaskConference: mocks.conference,
  remoteListEpics: vi.fn(),
}));
vi.mock('@shared/sync/idMap', () => ({
  getServerId: mocks.getServerId,
}));
vi.mock('@shared/sync/outbox', () => ({
  cancelOutboxForEntity: mocks.cancelOutbox,
  enqueueOutbox: mocks.enqueueOutbox,
}));
vi.mock('@shared/sync/SyncEngine', () => ({
  flushSync: mocks.flushSync,
  scheduleSync: mocks.scheduleSync,
}));
vi.mock('@shared/sync/syncConfig', () => ({
  isSyncQueueEnabled: mocks.syncQueueEnabled,
  isSyncEnabled: vi.fn(() => false),
}));
vi.mock('@shared/model/features', () => ({
  isCloudEnabled: mocks.cloudEnabled,
}));

import {
  createScheduledTask,
  createTask,
  createTaskConference,
  deleteTask,
  moveTaskStatus,
  patchTaskDetails,
  patchTaskEpic,
  renameTask,
  reorderTasks,
  scheduleTask,
} from '../tasks';

function task(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: 'task-1',
    status: TaskStatus.Todo,
    kind: TaskKind.Custom,
    title: 'Task',
    createdAt: '2026-08-27T08:00:00.000Z',
    updatedAt: '2026-08-27T08:00:00.000Z',
    ...overrides,
  };
}

describe('task mutation events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(task());
    mocks.list.mockResolvedValue([]);
    mocks.epicsList.mockResolvedValue([]);
    mocks.getServerId.mockResolvedValue('task-1');
    mocks.syncQueueEnabled.mockReturnValue(false);
    mocks.cloudEnabled.mockReturnValue(true);
    mocks.put.mockResolvedValue(undefined);
    mocks.putMany.mockResolvedValue(undefined);
    mocks.softDelete.mockResolvedValue(undefined);
    mocks.applyRemote.mockImplementation(async (value: TaskCard) => value);
    mocks.conference.mockResolvedValue(
      task({
        conferenceProvider: ConferenceProvider.Zoom,
        conferenceUrl: 'https://zoom.us/j/1',
      }),
    );
  });

  it('emits exactly once after every public durable mutation', async () => {
    const changed = vi.fn();
    window.addEventListener(NORDLY_EVENTS.tasksChanged, changed);

    try {
      await createTask({ title: 'Created' });
      expect(changed).toHaveBeenCalledTimes(1);

      await moveTaskStatus('task-1', TaskStatus.Done);
      expect(changed).toHaveBeenCalledTimes(2);

      await renameTask('task-1', 'Renamed');
      expect(changed).toHaveBeenCalledTimes(3);

      await scheduleTask('task-1', '2026-08-27T09:00:00+00:00', 30);
      expect(changed).toHaveBeenCalledTimes(4);

      await deleteTask('task-1');
      expect(changed).toHaveBeenCalledTimes(5);

      await reorderTasks([task({ order: 0 })]);
      expect(changed).toHaveBeenCalledTimes(6);

      await patchTaskEpic('task-1', null);
      expect(changed).toHaveBeenCalledTimes(7);

      await patchTaskDetails('task-1', { clearConference: true });
      expect(changed).toHaveBeenCalledTimes(8);

      await createTaskConference('task-1', ConferenceProvider.Zoom);
      expect(changed).toHaveBeenCalledTimes(9);

      await createScheduledTask({
        title: 'Scheduled',
        start: '2026-08-27T10:00:00+00:00',
        durationMin: 45,
      });
      expect(changed).toHaveBeenCalledTimes(10);
    } finally {
      window.removeEventListener(NORDLY_EVENTS.tasksChanged, changed);
    }
  });

  it('clears completedAt when a done task returns to todo', async () => {
    mocks.get.mockResolvedValue(
      task({
        status: TaskStatus.Done,
        completedAt: '2026-08-27T08:30:00.000Z',
      }),
    );

    const updated = await moveTaskStatus('task-1', TaskStatus.Todo);

    expect(updated.status).toBe(TaskStatus.Todo);
    expect(updated.completedAt).toBeUndefined();
    expect(mocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TaskStatus.Todo,
        completedAt: undefined,
      }),
    );
  });

  it('persists and queues a scheduled task as one public mutation', async () => {
    mocks.syncQueueEnabled.mockReturnValue(true);

    const created = await createScheduledTask({
      title: '  Scheduled task  ',
      start: '2026-08-27T09:00:00+00:00',
      durationMin: 45,
    });

    expect(created).toEqual(
      expect.objectContaining({
        title: 'Scheduled task',
        scheduledDurationMin: 45,
      }),
    );
    expect(new Date(created.scheduledStart!).toISOString()).toBe(
      '2026-08-27T09:00:00.000Z',
    );
    expect(mocks.put).toHaveBeenCalledWith(created);
    expect(mocks.enqueueOutbox).toHaveBeenNthCalledWith(
      1,
      'tasks',
      'create',
      created.id,
      { title: 'Scheduled task', kind: TaskKind.Custom },
    );
    expect(mocks.enqueueOutbox).toHaveBeenNthCalledWith(
      2,
      'tasks',
      'schedule',
      created.id,
      {
        startIso: created.scheduledStart,
        durationMin: 45,
      },
    );
    expect(mocks.scheduleSync).toHaveBeenCalledOnce();
  });

  it('does not emit when persistence fails', async () => {
    mocks.put.mockRejectedValueOnce(new Error('idb failed'));
    const changed = vi.fn();
    window.addEventListener(NORDLY_EVENTS.tasksChanged, changed);

    try {
      await expect(renameTask('task-1', 'Renamed')).rejects.toThrow('idb failed');
      expect(changed).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(NORDLY_EVENTS.tasksChanged, changed);
    }
  });
});
