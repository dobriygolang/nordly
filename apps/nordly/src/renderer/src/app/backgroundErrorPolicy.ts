import { isSyncError } from '@shared/sync/errors';

export type BackgroundErrorCategory =
  | 'network'
  | 'auth'
  | 'vault'
  | 'indexeddb'
  | 'unexpected';

export class BackgroundOperationError extends Error {
  readonly category: BackgroundErrorCategory;

  constructor(category: BackgroundErrorCategory, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'BackgroundOperationError';
    this.category = category;
  }
}

export function classifyBackgroundError(error: unknown): BackgroundErrorCategory {
  if (error instanceof BackgroundOperationError) return error.category;
  if (isSyncError(error)) {
    switch (error.code) {
      case 'no_network':
      case 'server_unreachable':
      case 'device_register_failed':
        return 'network';
      case 'session_expired':
        return 'auth';
    }
  }
  return 'unexpected';
}

export function shouldSurfaceBackgroundError(error: unknown): boolean {
  const category = classifyBackgroundError(error);
  return category !== 'network' && category !== 'auth';
}

export function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
