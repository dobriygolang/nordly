export type SyncOptions = {
  /** When true, reject if offline instead of silently queueing. */
  explicit?: boolean;
  /** When true, reset outbox attempts and reconcile local unsynced state before push. */
  retry?: boolean;
  /** Push local outbox only — skip remote pull (lighter startup path). */
  pushOnly?: boolean;
};

/**
 * Coalesce queued requests without weakening any request:
 * explicit/retry are additive, while one full sync upgrades a push-only batch.
 */
export function mergeSyncOptions(
  current?: SyncOptions,
  next?: SyncOptions,
): SyncOptions | undefined {
  if (!current) return next;
  if (!next) return current;
  return {
    explicit: current.explicit || next.explicit,
    retry: current.retry || next.retry,
    pushOnly: current.pushOnly && next.pushOnly,
  };
}
