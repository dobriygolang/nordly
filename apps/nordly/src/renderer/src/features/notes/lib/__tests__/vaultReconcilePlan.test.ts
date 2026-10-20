import { describe, expect, it } from 'vitest';

import {
  planVaultReconcile,
  type IndexEntry,
  type LocalFile,
  type RemoteNote,
} from '../vaultReconcilePlan';

const local = (path: string, hash: string): LocalFile => ({ path, hash });
const indexed = (path: string, hash: string, remoteUpdatedAt = 't0'): IndexEntry => ({
  path,
  serverId: `srv-${path}`,
  hash,
  remoteUpdatedAt,
});
const remote = (path: string, hash: string, updatedAt = 't0'): RemoteNote => ({
  path,
  serverId: `srv-${path}`,
  hash,
  updatedAt,
});

describe('planVaultReconcile', () => {
  it('refuses to plan when the folder is empty but the index is not', () => {
    expect(planVaultReconcile([], [indexed('a.md', 'h')], [])).toEqual({
      ok: false,
      reason: 'local_root_empty_but_index_full',
    });
  });

  it('follows the reconcile table', () => {
    const cases: { name: string; local: LocalFile[]; index: IndexEntry[]; remote: RemoteNote[]; ops: string[] }[] = [
      {
        name: 'unchanged',
        local: [local('a.md', 'h')],
        index: [indexed('a.md', 'h')],
        remote: [remote('a.md', 'h')],
        ops: [],
      },
      {
        name: 'local only changed',
        local: [local('a.md', 'h2')],
        index: [indexed('a.md', 'h')],
        remote: [remote('a.md', 'h')],
        ops: ['push_put'],
      },
      {
        name: 'remote only changed',
        local: [local('a.md', 'h')],
        index: [indexed('a.md', 'h', 't0')],
        remote: [remote('a.md', 'h2', 't1')],
        ops: ['pull_write'],
      },
      {
        name: 'both changed',
        local: [local('a.md', 'h2')],
        index: [indexed('a.md', 'h', 't0')],
        remote: [remote('a.md', 'h3', 't1')],
        ops: ['conflict_copy'],
      },
      {
        name: 'new local',
        local: [local('a.md', 'h')],
        index: [],
        remote: [],
        ops: ['push_put'],
      },
      {
        name: 'new remote',
        local: [],
        index: [],
        remote: [remote('a.md', 'h')],
        ops: ['pull_write'],
      },
      {
        name: 'first merge same bytes',
        local: [local('a.md', 'h')],
        index: [],
        remote: [remote('a.md', 'h', 't9')],
        ops: ['index_only'],
      },
      {
        name: 'first merge different bytes',
        local: [local('a.md', 'local')],
        index: [],
        remote: [remote('a.md', 'remote', 't9')],
        ops: ['conflict_copy'],
      },
      {
        name: 'deleted in Finder',
        local: [local('keep.md', 'k')],
        index: [indexed('keep.md', 'k'), indexed('a.md', 'h')],
        remote: [remote('keep.md', 'k'), remote('a.md', 'h')],
        ops: ['push_delete'],
      },
      {
        name: 'deleted locally but remote moved on',
        local: [local('keep.md', 'k')],
        index: [indexed('keep.md', 'k'), indexed('a.md', 'h', 't0')],
        remote: [remote('keep.md', 'k'), remote('a.md', 'h2', 't1')],
        ops: ['pull_write'],
      },
      {
        name: 'deleted on the server',
        local: [local('a.md', 'h')],
        index: [indexed('a.md', 'h')],
        remote: [],
        ops: ['pull_trash'],
      },
      {
        name: 'deleted on the server after a local edit',
        local: [local('a.md', 'h2')],
        index: [indexed('a.md', 'h')],
        remote: [],
        ops: ['push_put'],
      },
      {
        name: 'index leftover',
        local: [local('keep.md', 'k')],
        index: [indexed('keep.md', 'k'), indexed('a.md', 'h')],
        remote: [remote('keep.md', 'k')],
        ops: ['index_drop'],
      },
    ];

    for (const row of cases) {
      const plan = planVaultReconcile(row.local, row.index, row.remote);
      expect(plan.ok, row.name).toBe(true);
      if (plan.ok) {
        expect(plan.actions.map((action) => action.op), row.name).toEqual(row.ops);
      }
    }
  });

  it('rejects paths that differ only by case', () => {
    expect(() => planVaultReconcile(
      [local('Notes.md', 'h'), local('notes.md', 'h2')],
      [],
      [],
    )).toThrow(/differ only by case/);
    expect(() => planVaultReconcile(
      [local('Notes.md', 'h')],
      [],
      [remote('notes.md', 'h2', 't1')],
    )).toThrow(/differ only by case/);
  });
});
