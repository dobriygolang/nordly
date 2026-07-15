import { mergeSyncOptions, type SyncOptions } from '@shared/sync/options';

type SyncJob = {
  options?: SyncOptions;
  resolve: () => void;
  reject: (err: unknown) => void;
};

type SerialSyncQueueDeps = {
  run: (options?: SyncOptions) => Promise<void>;
  onBatchError: (err: unknown) => void;
};

export class SerialSyncQueue {
  private jobs: SyncJob[] = [];
  private draining = false;
  /** Incremented on stop so an in-flight drain cannot unlock a new engine session. */
  private generation = 0;

  constructor(private readonly deps: SerialSyncQueueDeps) {}

  enqueue(options?: SyncOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.jobs.push({ options, resolve, reject });
      this.drain();
    });
  }

  stopGeneration(): void {
    this.generation += 1;
    this.jobs = [];
    this.draining = false;
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    const generation = this.generation;

    void (async () => {
      try {
        while (this.jobs.length > 0) {
          if (generation !== this.generation) break;
          const batch = this.jobs.splice(0);
          let options: SyncOptions | undefined;
          for (const job of batch) {
            options = mergeSyncOptions(options, job.options);
          }

          try {
            await this.deps.run(options);
            for (const job of batch) job.resolve();
          } catch (err) {
            this.deps.onBatchError(err);
            for (const job of batch) {
              if (job.options?.explicit) job.reject(err);
              else job.resolve();
            }
          }
        }
      } finally {
        if (generation === this.generation) {
          this.draining = false;
          if (this.jobs.length > 0) this.drain();
        }
      }
    })();
  }
}
