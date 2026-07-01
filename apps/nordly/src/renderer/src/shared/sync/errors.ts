export type SyncErrorCode = 'no_network' | 'server_unreachable' | 'session_expired';

export class SyncError extends Error {
  readonly code: SyncErrorCode;

  constructor(code: SyncErrorCode, message: string) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

export function isSyncError(err: unknown): err is SyncError {
  return err instanceof SyncError;
}
