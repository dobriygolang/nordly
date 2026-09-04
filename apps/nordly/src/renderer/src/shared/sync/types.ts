import type { TimerMode } from '@shared/model/settings';

export const SyncDomain = {
  Notes: 'notes',
  Tasks: 'tasks',
  Focus: 'focus',
  Vault: 'vault',
} as const;
export type SyncDomain = (typeof SyncDomain)[keyof typeof SyncDomain];

export const OutboxOp = {
  Create: 'create',
  Update: 'update',
  Patch: 'patch',
  Delete: 'delete',
  Schedule: 'schedule',
  Status: 'status',
  SessionStart: 'session_start',
  SessionEnd: 'session_end',
  AttachmentPut: 'attachment_put',
  AttachmentDelete: 'attachment_delete',
  FilePut: 'file_put',
  FileDelete: 'file_delete',
} as const;
export type OutboxOp = (typeof OutboxOp)[keyof typeof OutboxOp];

export interface NoteOutboxPayload {
  title: string;
  bodyMd: string;
  wikiLinks: Array<{ linkText: string; targetNoteId: string }>;
}

export type TaskPatchOutboxPayload =
  | { clearEpic: true }
  | { epicId: string }
  | { epicColor: string }
  | { clearConference: true };

export interface SyncPayloadMap {
  [SyncDomain.Notes]: {
    [OutboxOp.Create]: NoteOutboxPayload;
    [OutboxOp.Update]: NoteOutboxPayload;
    [OutboxOp.Delete]: Record<string, never>;
    [OutboxOp.AttachmentPut]: { noteId: string };
    [OutboxOp.AttachmentDelete]: { noteId: string };
  };
  [SyncDomain.Tasks]: {
    [OutboxOp.Create]: { title: string; kind: string };
    [OutboxOp.Delete]: Record<string, never>;
    [OutboxOp.Status]: { status: string };
    [OutboxOp.Schedule]: { startIso: string; durationMin: number };
    [OutboxOp.Patch]: TaskPatchOutboxPayload;
  };
  [SyncDomain.Focus]: {
    [OutboxOp.SessionStart]: {
      planItemId: string;
      pinnedTitle: string;
      mode: TimerMode;
      clientSessionId: string;
      startedAt: string;
    };
    [OutboxOp.SessionEnd]: {
      pomodorosCompleted: number;
      secondsFocused: number;
      endedAt: string;
    };
  };
  [SyncDomain.Vault]: {
    [OutboxOp.FilePut]: {
      path: string;
      hash: string;
      mtimeMs: number;
      kind: 'md' | 'bin';
    };
    [OutboxOp.FileDelete]: { path: string };
  };
}

export type SyncOp<D extends SyncDomain> =
  keyof SyncPayloadMap[D] & OutboxOp;

export type SyncPayload<
  D extends SyncDomain,
  O extends SyncOp<D>,
> = SyncPayloadMap[D][O];

interface OutboxEntryBase<
  D extends SyncDomain,
  O extends SyncOp<D>,
> {
  id: string;
  userId: string;
  domain: D;
  op: O;
  entityId: string;
  serverId?: string;
  createdAt: number;
  attempts: number;
}

export type OutboxEntryFor<D extends SyncDomain> = {
  [O in SyncOp<D>]: OutboxEntryBase<D, O> & {
    payload: SyncPayload<D, O>;
  };
}[SyncOp<D>];

export type OutboxEntry = {
  [D in SyncDomain]: OutboxEntryFor<D>;
}[SyncDomain];

export interface IdMapEntry {
  key: string;
  userId: string;
  domain: SyncDomain;
  localId: string;
  serverId: string;
}

export interface SyncCursor {
  key: string;
  userId: string;
  domain: SyncDomain;
  value: string;
  updatedAt: number;
}

export const SyncStatus = {
  Idle: 'idle',
  Syncing: 'syncing',
  Offline: 'offline',
  Error: 'error',
} as const;
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus];
