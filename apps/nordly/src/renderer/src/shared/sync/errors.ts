export type SyncErrorCode =
  | 'no_network'
  | 'server_unreachable'
  | 'session_expired'
  | 'device_register_failed';

export class SyncError extends Error {
  readonly code: SyncErrorCode;

  constructor(code: SyncErrorCode, message: string) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

/** Recoverable blocker — retry later without burning outbox attempts. */
export class SyncDeferredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncDeferredError';
  }
}

export class SyncAbortedError extends Error {
  constructor() {
    super('Sync stopped before the queued operation could run');
    this.name = 'SyncAbortedError';
  }
}

export function isSyncError(err: unknown): err is SyncError {
  return err instanceof SyncError;
}

export function isSyncDeferredError(err: unknown): err is SyncDeferredError {
  return err instanceof SyncDeferredError;
}
