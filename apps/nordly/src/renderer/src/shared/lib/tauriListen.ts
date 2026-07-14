import { listen, type EventCallback, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Subscribe to a Tauri event and return an effect cleanup that always
 * unregisters — even when unmount races the listen() promise.
 */
export function listenEffect<T>(
  event: string,
  handler: EventCallback<T>,
): () => void {
  let cancelled = false;
  let unlisten: UnlistenFn | undefined;
  void listen<T>(event, handler).then((off) => {
    if (cancelled) {
      off();
      return;
    }
    unlisten = off;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/** Same race-safe cleanup for multiple listen() promises. */
export function listenEffects(setup: (track: (p: Promise<UnlistenFn>) => void) => void): () => void {
  let cancelled = false;
  const offs: UnlistenFn[] = [];
  setup((p) => {
    void p.then((off) => {
      if (cancelled) {
        off();
        return;
      }
      offs.push(off);
    });
  });
  return () => {
    cancelled = true;
    for (const off of offs) off();
  };
}
