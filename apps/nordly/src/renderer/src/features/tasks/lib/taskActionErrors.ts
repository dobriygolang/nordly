import { isApiHttpError } from '@shared/api/errors';

export const TaskActionErrorCode = {
  TaskNotSynced: 'task_not_synced',
  GoogleNotConnected: 'google_not_connected',
  GoogleReauthRequired: 'google_reauth_required',
  ZoomNotConnected: 'zoom_not_connected',
  ZoomReauthRequired: 'zoom_reauth_required',
  ConferenceNotAvailable: 'conference_not_available',
  IntegrationsRequireCloud: 'integrations_require_cloud',
} as const;

export type TaskActionErrorCode =
  (typeof TaskActionErrorCode)[keyof typeof TaskActionErrorCode];

export class TaskActionError extends Error {
  readonly code: TaskActionErrorCode;

  constructor(code: TaskActionErrorCode) {
    super(code);
    this.name = 'TaskActionError';
    this.code = code;
  }
}

export function isAuthError(err: unknown): boolean {
  return isApiHttpError(err, 401) || isApiHttpError(err, 403);
}

/** Mutation failures that belong in inline UI — never crash the page via `throw loadError`. */
export function isRecoverableTaskActionError(err: unknown): boolean {
  return err instanceof TaskActionError;
}
