export const NOTES_LIST_COALESCE_MS = 80;

type TimerHandle = ReturnType<typeof setTimeout>;

/** Trailing coalesce: N calls within `delayMs` collapse to one `fn`. */
export function createTrailingCoalesce(
  fn: () => void,
  delayMs: number,
): {
  schedule: () => void;
  cancel: () => void;
} {
  let timer: TimerHandle | null = null;
  return {
    schedule() {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (timer == null) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}
