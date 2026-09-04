export const TaskStatus = {
  Todo: 'todo',
  Done: 'done',
  Dismissed: 'dismissed',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];
export const TASK_STATUSES = Object.values(TaskStatus);
export const TASK_STATUS_SET = new Set<TaskStatus>(TASK_STATUSES);

export const TaskKind = {
  Custom: 'custom',
} as const;
export type TaskKind = (typeof TaskKind)[keyof typeof TaskKind];
export const TASK_KINDS = Object.values(TaskKind);
export const TASK_KIND_SET = new Set<TaskKind>(TASK_KINDS);

export const ConferenceProvider = {
  Meet: 'meet',
  Zoom: 'zoom',
} as const;
export type ConferenceProvider = (typeof ConferenceProvider)[keyof typeof ConferenceProvider];
export const CONFERENCE_PROVIDERS = Object.values(ConferenceProvider);
export const CONFERENCE_PROVIDER_SET = new Set<ConferenceProvider>(CONFERENCE_PROVIDERS);

export const ConferenceDisplayProvider = {
  ...ConferenceProvider,
  Other: 'other',
} as const;
export type ConferenceDisplayProvider =
  (typeof ConferenceDisplayProvider)[keyof typeof ConferenceDisplayProvider];

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUS_SET.has(value as TaskStatus);
}

export function isTaskKind(value: string): value is TaskKind {
  return TASK_KIND_SET.has(value as TaskKind);
}

export function isConferenceProvider(value: string): value is ConferenceProvider {
  return CONFERENCE_PROVIDER_SET.has(value as ConferenceProvider);
}

export function isVisibleTaskStatus(status: TaskStatus): boolean {
  return status !== TaskStatus.Dismissed;
}

export function isActiveForReminder(status: TaskStatus): boolean {
  return status === TaskStatus.Todo;
}

export function isTaskDone(status: TaskStatus): boolean {
  return status === TaskStatus.Done;
}

export function nextTaskCompletionStatus(status: TaskStatus): TaskStatus {
  return isTaskDone(status) ? TaskStatus.Todo : TaskStatus.Done;
}

export const VISIBLE_TASK_STATUSES = new Set<TaskStatus>(
  TASK_STATUSES.filter(isVisibleTaskStatus),
);
