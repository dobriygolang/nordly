import { listen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event';

import { trackAsyncDisposer } from '@shared/lib/asyncDisposer';

function logListenError(event: string, error: unknown): void {
  console.error(`[nordly:tauri] ${event} listener failed`, error);
}

/**
 * Subscribe to a Tauri event and return an effect cleanup that always
 * unregisters — even when unmount races the listen() promise.
 */
export function listenEffect<T>(
  event: string,
  handler: EventCallback<T>,
): () => void {
  return trackAsyncDisposer(
    listen<T>(event, handler),
    (error) => logListenError(event, error),
  );
}

/** Same race-safe cleanup for multiple listen() promises. */
export function listenEffects(setup: (track: (p: Promise<UnlistenFn>) => void) => void): () => void {
  const cleanups: Array<() => void> = [];
  setup((p) => {
    cleanups.push(
      trackAsyncDisposer(p, (error) => logListenError('grouped Tauri event', error)),
    );
  });
  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
