export type Disposer = () => void;

/**
 * Turn an asynchronously acquired disposer into synchronous effect cleanup.
 * If cleanup wins the race, the disposer runs as soon as acquisition resolves.
 */
export function trackAsyncDisposer(
  pending: Promise<Disposer>,
  onError: (error: unknown) => void,
): Disposer {
  let cleanupRequested = false;
  let disposer: Disposer | null = null;
  let disposed = false;

  const dispose = (): void => {
    if (disposed || !disposer) return;
    disposed = true;
    try {
      disposer();
    } catch (error) {
      onError(error);
    }
  };

  void pending.then(
    (resolved) => {
      disposer = resolved;
      if (cleanupRequested) dispose();
    },
    (error: unknown) => {
      onError(error);
    },
  );

  return () => {
    cleanupRequested = true;
    dispose();
  };
}
