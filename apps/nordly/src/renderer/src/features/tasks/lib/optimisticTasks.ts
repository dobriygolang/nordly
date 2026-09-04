import type { TaskCard } from '@features/tasks/model/task';

/** True when a sync hydrate would not change the board — skip setState. */
export function sameTaskCards(a: TaskCard[], b: TaskCard[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (
      left.id !== right.id ||
      left.updatedAt !== right.updatedAt ||
      left.status !== right.status ||
      left.kind !== right.kind ||
      left.title !== right.title ||
      left.createdAt !== right.createdAt ||
      left.completedAt !== right.completedAt ||
      left.scheduledStart !== right.scheduledStart ||
      left.scheduledDurationMin !== right.scheduledDurationMin ||
      left.order !== right.order ||
      left.googleEventId !== right.googleEventId ||
      left.googleCalendarId !== right.googleCalendarId ||
      left.epicId !== right.epicId ||
      left.epicColor !== right.epicColor ||
      left.conferenceUrl !== right.conferenceUrl ||
      left.conferenceProvider !== right.conferenceProvider ||
      left.zoomMeetingId !== right.zoomMeetingId
    ) {
      return false;
    }
  }
  return true;
}

interface TaskMutationCoordinatorDependencies {
  getTasks: () => TaskCard[];
  setTasks: (tasks: TaskCard[]) => void;
  loadTasks: () => Promise<TaskCard[]>;
  onHydrationError: (error: unknown) => void;
  onHydrated?: () => void;
}

interface TaskMutation<T> {
  optimistic: (tasks: TaskCard[]) => TaskCard[];
  persist: () => Promise<T>;
  commit?: (tasks: TaskCard[], result: T) => TaskCard[];
  onError: (error: unknown) => void;
  throwOnError?: boolean;
}

/**
 * Keeps optimistic UI ahead of asynchronous IDB/sync hydration.
 *
 * Mutations render immediately but their durable commits run in invocation order.
 * Hydration waits until every queued commit settles, and a stale in-flight hydrate
 * is retried against the latest mutation generation.
 */
export class TaskMutationCoordinator {
  private readonly dependencies: TaskMutationCoordinatorDependencies;
  private mutationGeneration = 0;
  private pendingMutations = 0;
  private commitTail: Promise<void> = Promise.resolve();
  private hydrationRequested = false;
  private hydrationInFlight = false;

  constructor(dependencies: TaskMutationCoordinatorDependencies) {
    this.dependencies = dependencies;
  }

  getTasks(): TaskCard[] {
    return this.dependencies.getTasks();
  }

  requestHydration(): Promise<void> {
    this.hydrationRequested = true;
    return this.flushHydration();
  }

  async mutate<T>({
    optimistic,
    persist,
    commit,
    onError,
    throwOnError = false,
  }: TaskMutation<T>): Promise<T | undefined> {
    const snapshot = this.dependencies.getTasks();
    const optimisticTasks = optimistic(snapshot);
    const generation = ++this.mutationGeneration;
    this.pendingMutations += 1;
    this.dependencies.setTasks(optimisticTasks);

    const durableCommit = this.commitTail.then(persist);
    this.commitTail = durableCommit.then(
      () => undefined,
      () => undefined,
    );

    try {
      const result = await durableCommit;
      if (generation === this.mutationGeneration) {
        if (commit) {
          this.dependencies.setTasks(commit(this.dependencies.getTasks(), result));
        }
      } else {
        this.hydrationRequested = true;
      }
      return result;
    } catch (error) {
      if (generation === this.mutationGeneration) {
        this.dependencies.setTasks(snapshot);
      }
      this.hydrationRequested = true;
      onError(error);
      if (throwOnError) throw error;
      return undefined;
    } finally {
      this.pendingMutations -= 1;
      if (this.pendingMutations === 0) {
        await this.flushHydration();
      }
    }
  }

  private async flushHydration(): Promise<void> {
    if (
      this.pendingMutations > 0 ||
      this.hydrationInFlight ||
      !this.hydrationRequested
    ) {
      return;
    }

    while (this.hydrationRequested && this.pendingMutations === 0) {
      this.hydrationRequested = false;
      this.hydrationInFlight = true;
      const generation = this.mutationGeneration;

      try {
        const tasks = await this.dependencies.loadTasks();
        if (
          this.pendingMutations > 0 ||
          generation !== this.mutationGeneration
        ) {
          this.hydrationRequested = true;
        } else {
          const current = this.dependencies.getTasks();
          if (!sameTaskCards(current, tasks)) {
            this.dependencies.setTasks(tasks);
          }
          this.dependencies.onHydrated?.();
        }
      } catch (error) {
        this.dependencies.onHydrationError(error);
      } finally {
        this.hydrationInFlight = false;
      }
    }
  }
}
