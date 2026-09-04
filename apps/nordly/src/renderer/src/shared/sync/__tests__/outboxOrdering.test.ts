import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock('@shared/db/nordlyDb', () => ({
  dbDelete: vi.fn(),
  dbGetAllByUser: vi.fn(async () => []),
  dbPut: mocks.put,
  requireUserId: () => 'user-1',
}));

import { enqueueOutbox } from '@shared/sync/outbox';
import { OutboxOp, SyncDomain } from '@shared/sync/types';

afterEach(() => {
  vi.useRealTimers();
});

describe('outbox ordering', () => {
  it('assigns strictly increasing timestamps to same-tick mutations', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    await enqueueOutbox(SyncDomain.Tasks, OutboxOp.Create, 'task-1', {
      title: 'Task',
      kind: 'custom',
    });
    await enqueueOutbox(SyncDomain.Tasks, OutboxOp.Schedule, 'task-1', {
      startIso: '2026-08-27T10:00:00.000Z',
      durationMin: 30,
    });

    const first = mocks.put.mock.calls[0]![1] as { createdAt: number };
    const second = mocks.put.mock.calls[1]![1] as { createdAt: number };
    expect(second.createdAt).toBeGreaterThan(first.createdAt);
  });
});
