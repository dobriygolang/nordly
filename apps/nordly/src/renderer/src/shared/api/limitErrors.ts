export type LimitErrorCode =
  | 'cloud_notes_quota'
  | 'published_notes_quota'
  | 'feature_disabled'
  | 'cloud_sync_disabled'
  | 'device_limit_exceeded'
  | 'quota_exceeded';

export class LimitError extends Error {
  readonly code: LimitErrorCode;

  constructor(code: LimitErrorCode, message: string) {
    super(message);
    this.name = 'LimitError';
    this.code = code;
  }
}

export function isLimitError(err: unknown): err is LimitError {
  return err instanceof LimitError;
}

type LimitContext = 'notes_create' | 'notes_publish' | 'device_register' | 'generic';

async function readErrorBody(resp: Response): Promise<{ message: string; code?: string }> {
  try {
    const body = (await resp.json()) as Record<string, unknown>;
    const message =
      (typeof body.message === 'string' && body.message) ||
      (typeof body.error === 'string' && body.error) ||
      `HTTP ${resp.status}`;
    const code = typeof body.code === 'string' ? body.code : undefined;
    return { message, code };
  } catch {
    return { message: `HTTP ${resp.status}` };
  }
}

function mapStatusToLimitError(
  status: number,
  message: string,
  code: string | undefined,
  context: LimitContext,
): LimitError | null {
  const lower = message.toLowerCase();

  if (code === 'cloud_sync_disabled') {
    return new LimitError('cloud_sync_disabled', message);
  }
  if (code === 'device_limit_exceeded') {
    return new LimitError('device_limit_exceeded', message);
  }

  if (status === 403) {
    if (lower.includes('feature') || lower.includes('plan')) {
      return new LimitError('feature_disabled', message);
    }
    if (lower.includes('cloud sync')) {
      return new LimitError('cloud_sync_disabled', message);
    }
    if (lower.includes('device')) {
      return new LimitError('device_limit_exceeded', message);
    }
  }

  if (status === 429 || (status === 400 && lower.includes('quota'))) {
    if (context === 'notes_publish' || lower.includes('publish')) {
      return new LimitError('published_notes_quota', message);
    }
    if (context === 'notes_create' || lower.includes('notes')) {
      return new LimitError('cloud_notes_quota', message);
    }
    return new LimitError('quota_exceeded', message);
  }

  if (lower.includes('quota exceeded') || lower.includes('resource exhausted')) {
    if (context === 'notes_publish') return new LimitError('published_notes_quota', message);
    if (context === 'notes_create') return new LimitError('cloud_notes_quota', message);
    return new LimitError('quota_exceeded', message);
  }

  return null;
}

export async function limitErrorFromResponse(
  resp: Response,
  context: LimitContext = 'generic',
): Promise<LimitError | null> {
  if (resp.ok) return null;
  const { message, code } = await readErrorBody(resp);
  return mapStatusToLimitError(resp.status, message, code, context);
}

export async function throwIfLimitResponse(
  resp: Response,
  context: LimitContext = 'generic',
): Promise<void> {
  const err = await limitErrorFromResponse(resp, context);
  if (err) throw err;
}

export function limitErrorMessageKey(code: LimitErrorCode): string {
  switch (code) {
    case 'cloud_notes_quota':
      return 'nordly.limits.cloud_notes_quota';
    case 'published_notes_quota':
      return 'nordly.limits.published_notes_quota';
    case 'feature_disabled':
      return 'nordly.limits.feature_disabled';
    case 'cloud_sync_disabled':
      return 'nordly.limits.cloud_sync_disabled';
    case 'device_limit_exceeded':
      return 'nordly.limits.device_limit_exceeded';
    default:
      return 'nordly.limits.quota_exceeded';
  }
}

export function formatLimitError(err: unknown, t: (key: string) => string): string {
  if (isLimitError(err)) {
    return t(limitErrorMessageKey(err.code));
  }
  return err instanceof Error ? err.message : String(err);
}
