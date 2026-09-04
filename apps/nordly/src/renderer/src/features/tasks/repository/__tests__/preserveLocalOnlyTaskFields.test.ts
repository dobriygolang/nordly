import { describe, expect, it } from 'vitest';

import { TaskKind, TaskStatus } from '@features/tasks/model/status';
import { preserveLocalOnlyTaskFields } from '@features/tasks/repository/tasksStore';

describe('preserveLocalOnlyTaskFields', () => {
  it('does not resurrect an epic that the remote task cleared', () => {
    const merged = preserveLocalOnlyTaskFields(
      {
        id: 't1',
        status: TaskStatus.Todo,
        kind: TaskKind.Custom,
        title: 'A',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        epicId: 'epic-local',
        order: 3,
      },
      {
        id: 't1',
        status: TaskStatus.Todo,
        kind: TaskKind.Custom,
        title: 'A',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    );

    expect(merged.epicId).toBeUndefined();
    expect(merged.order).toBe(3);
  });
});
