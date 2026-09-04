export interface LatestOnlyWriter<T> {
  update(value: T): void;
  flush(): Promise<boolean>;
  discardPending(): void;
}

interface LatestOnlyWriterOptions<T> {
  write: (value: T) => Promise<void>;
  onSaved: (value: T) => void;
  onError: (error: unknown) => void;
}

/**
 * Serializes writes and keeps draining when the value changes during an await.
 * Concurrent flush callers share one promise and only resolve after the latest
 * observed value is durable.
 */
export function createLatestOnlyWriter<T>({
  write,
  onSaved,
  onError,
}: LatestOnlyWriterOptions<T>): LatestOnlyWriter<T> {
  let current: T | undefined;
  let revision = 0;
  let savedRevision = 0;
  let inFlight: Promise<boolean> | null = null;

  const drain = async (): Promise<boolean> => {
    while (savedRevision < revision) {
      if (current === undefined) {
        throw new Error('LatestOnlyWriter: pending revision has no value');
      }
      const value = current;
      const targetRevision = revision;
      try {
        await write(value);
      } catch (error) {
        onError(error);
        return false;
      }
      savedRevision = Math.max(savedRevision, targetRevision);
      onSaved(value);
    }
    return true;
  };

  return {
    update(value) {
      current = value;
      revision += 1;
    },
    flush() {
      if (inFlight) return inFlight;
      const pending = drain();
      inFlight = pending;
      void pending.then(
        () => {
          if (inFlight === pending) inFlight = null;
        },
        () => {
          if (inFlight === pending) inFlight = null;
        },
      );
      return pending;
    },
    discardPending() {
      savedRevision = revision;
    },
  };
}
