import { describe, expect, it, vi } from 'vitest';

import type { TaskCard } from '@features/tasks/api/tasks';
import { TaskKind, TaskStatus } from '@features/tasks/model/status';

import { sameTaskCards, TaskMutationCoordinator } from '../optimisticTasks';

function task(id: string, title: string): TaskCard {
  return {
    id,
    title,
    status: TaskStatus.Todo,
    kind: TaskKind.Custom,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function coordinatorHarness(initial: TaskCard[], loadTasks = vi.fn(async () => initial)) {
  let current = initial;
  const setTasks = vi.fn((next: TaskCard[]) => {
    current = next;
  });
  const onHydrationError = vi.fn();
  const coordinator = new TaskMutationCoordinator({
    getTasks: () => current,
    setTasks,
    loadTasks,
    onHydrationError,
  });
  return {
    coordinator,
    current: () => current,
    setTasks,
    onHydrationError,
  };
}

describe('sameTaskCards', () => {
  it('detects a corrected creation timestamp', () => {
    const original = task('a', 'Task');
    expect(
      sameTaskCards(
        [original],
        [{ ...original, createdAt: '2026-01-02T00:00:00.000Z' }],
      ),
    ).toBe(false);
  });
});

describe('TaskMutationCoordinator', () => {
  it('does not let a mid-flight hydrate overwrite optimistic state', async () => {
    const original = [task('a', 'old')];
    const optimistic = [task('a', 'optimistic')];
    const committed = [task('a', 'committed')];
    const firstHydrate = deferred<TaskCard[]>();
    const persist = deferred<TaskCard>();
    const loadTasks = vi
      .fn<() => Promise<TaskCard[]>>()
      .mockReturnValueOnce(firstHydrate.promise)
      .mockResolvedValueOnce(committed);
    const harness = coordinatorHarness(original, loadTasks);

    const hydration = harness.coordinator.requestHydration();
    const mutation = harness.coordinator.mutate({
      optimistic: () => optimistic,
      persist: () => persist.promise,
      commit: (_current, result) => [result],
      onError: vi.fn(),
    });

    firstHydrate.resolve(original);
    await hydration;
    expect(harness.current()).toEqual(optimistic);
    expect(harness.setTasks).not.toHaveBeenCalledWith(original);

    persist.resolve(committed[0]!);
    await mutation;
    expect(harness.current()).toEqual(committed);
    expect(loadTasks).toHaveBeenCalledTimes(2);
  });

  it('restores its snapshot and reports a failed durable commit', async () => {
    const original = [task('a', 'old')];
    const failure = new Error('task_not_synced');
    const onError = vi.fn();
    const harness = coordinatorHarness(original);

    const result = await harness.coordinator.mutate({
      optimistic: () => [task('a', 'optimistic')],
      persist: async () => {
        throw failure;
      },
      onError,
    });

    expect(result).toBeUndefined();
    expect(harness.setTasks).toHaveBeenCalledWith(original);
    expect(harness.current()).toEqual(original);
    expect(onError).toHaveBeenCalledWith(failure);
  });

  it('serializes rapid DnD commits while applying both optimistic drops', async () => {
    const firstCommit = deferred<TaskCard>();
    const calls: string[] = [];
    const harness = coordinatorHarness(
      [task('a', 'old')],
      vi.fn(async () => [task('a', 'second committed')]),
    );

    const first = harness.coordinator.mutate({
      optimistic: () => [task('a', 'first optimistic')],
      persist: () => {
        calls.push('first');
        return firstCommit.promise;
      },
      commit: (_current, result) => [result],
      onError: vi.fn(),
    });
    const second = harness.coordinator.mutate({
      optimistic: () => [task('a', 'second optimistic')],
      persist: async () => {
        calls.push('second');
        return task('a', 'second committed');
      },
      commit: (_current, result) => [result],
      onError: vi.fn(),
    });

    await Promise.resolve();
    expect(calls).toEqual(['first']);
    expect(harness.current()[0]?.title).toBe('second optimistic');

    firstCommit.resolve(task('a', 'first committed'));
    await first;
    await second;
    expect(calls).toEqual(['first', 'second']);
    expect(harness.current()[0]?.title).toBe('second committed');
  });
});

describe('sameTaskCards', () => {
  it('returns true for identical board fields', () => {
    const a = [task('a', 'one')];
    const b = [{ ...task('a', 'one') }];
    expect(sameTaskCards(a, b)).toBe(true);
  });

  it('returns false when a synced field changes', () => {
    const a = [task('a', 'one')];
    const b = [{ ...task('a', 'one'), title: 'two' }];
    expect(sameTaskCards(a, b)).toBe(false);
  });

  it('detects a changed conference calendar id', () => {
    const a = [task('a', 'one')];
    const b = [{ ...task('a', 'one'), googleCalendarId: 'team@example.com' }];
    expect(sameTaskCards(a, b)).toBe(false);
  });
});
