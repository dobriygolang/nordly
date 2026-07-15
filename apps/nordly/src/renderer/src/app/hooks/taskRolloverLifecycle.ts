interface TaskRolloverLifecycleOptions {
  run: () => Promise<unknown>;
  onError: (error: unknown) => void;
  windowTarget?: Window;
  documentTarget?: Document;
  delayMs?: number;
}

export function startTaskRolloverLifecycle({
  run,
  onError,
  windowTarget = window,
  documentTarget = document,
  delayMs = 2_000,
}: TaskRolloverLifecycleOptions): () => void {
  const roll = (): void => {
    void run().catch(onError);
  };
  const startupTimer = windowTarget.setTimeout(roll, delayMs);
  let focusTimer: number | null = null;

  const onFocus = (): void => {
    if (focusTimer !== null) windowTarget.clearTimeout(focusTimer);
    focusTimer = windowTarget.setTimeout(roll, delayMs);
  };
  const onVisible = (): void => {
    if (documentTarget.visibilityState === 'visible') onFocus();
  };

  windowTarget.addEventListener('focus', onFocus);
  documentTarget.addEventListener('visibilitychange', onVisible);
  return () => {
    windowTarget.clearTimeout(startupTimer);
    if (focusTimer !== null) windowTarget.clearTimeout(focusTimer);
    windowTarget.removeEventListener('focus', onFocus);
    documentTarget.removeEventListener('visibilitychange', onVisible);
  };
}
