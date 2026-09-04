import { ConferenceProvider, TaskKind, TaskStatus } from '../model/status';

const STATUS_TO_WIRE: Record<TaskStatus, string> = {
  [TaskStatus.Todo]: 'WORK_STATUS_TODO',
  [TaskStatus.Done]: 'WORK_STATUS_DONE',
  [TaskStatus.Dismissed]: 'WORK_STATUS_DISMISSED',
};

const KIND_TO_WIRE: Record<TaskKind, string> = {
  [TaskKind.Custom]: 'WORK_KIND_CUSTOM',
};

const PROVIDER_TO_WIRE: Record<ConferenceProvider, string> = {
  [ConferenceProvider.Meet]: 'CONFERENCE_PROVIDER_MEET',
  [ConferenceProvider.Zoom]: 'CONFERENCE_PROVIDER_ZOOM',
};

const STATUS_FROM_WIRE = invert(STATUS_TO_WIRE);
const KIND_FROM_WIRE = invert(KIND_TO_WIRE);
const PROVIDER_FROM_WIRE = invert(PROVIDER_TO_WIRE);

function invert<K extends string>(map: Record<K, string>): Record<string, K> {
  const out: Record<string, K> = {};
  for (const [local, wire] of Object.entries(map) as [K, string][]) {
    out[wire] = local;
  }
  return out;
}

export function taskStatusToWire(status: TaskStatus): string {
  return STATUS_TO_WIRE[status];
}

export function taskStatusFromWire(raw: string): TaskStatus {
  const status = STATUS_FROM_WIRE[raw];
  if (!status) throw new Error(`Invalid task response: status ${raw}`);
  return status;
}

export function taskKindToWire(kind: TaskKind): string {
  return KIND_TO_WIRE[kind];
}

export function taskKindFromWire(raw: string): TaskKind {
  const kind = KIND_FROM_WIRE[raw];
  if (!kind) throw new Error(`Invalid task response: kind ${raw}`);
  return kind;
}

export function conferenceProviderToWire(provider: ConferenceProvider): string {
  return PROVIDER_TO_WIRE[provider];
}

export function conferenceProviderFromWire(raw: string): ConferenceProvider {
  const provider = PROVIDER_FROM_WIRE[raw];
  if (!provider) throw new Error(`Invalid task response: conferenceProvider ${raw}`);
  return provider;
}
