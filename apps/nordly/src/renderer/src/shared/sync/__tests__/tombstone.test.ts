import { describe, expect, it } from 'vitest';

import {
  shouldAcceptRemoteEntity,
  syncedIdsAbsentFromRemote,
} from '@shared/sync/tombstone';

describe('shouldAcceptRemoteEntity', () => {
  it('accepts remote when no local row', () => {
    expect(shouldAcceptRemoteEntity(null, '2026-01-02T00:00:00.000Z')).toBe(true);
  });

  it('never revives a local tombstone even if remote is newer', () => {
    expect(
      shouldAcceptRemoteEntity(
        { deleted: true, updatedAt: '2026-01-01T00:00:00.000Z' },
        '2026-01-03T00:00:00.000Z',
      ),
    ).toBe(false);
  });

  it('accepts remote when LWW wins', () => {
    expect(
      shouldAcceptRemoteEntity(
        { deleted: false, updatedAt: '2026-01-01T00:00:00.000Z' },
        '2026-01-02T00:00:00.000Z',
      ),
    ).toBe(true);
  });

  it('rejects remote when local is newer', () => {
    expect(
      shouldAcceptRemoteEntity(
        { deleted: false, updatedAt: '2026-01-03T00:00:00.000Z' },
        '2026-01-02T00:00:00.000Z',
      ),
    ).toBe(false);
  });
});

describe('syncedIdsAbsentFromRemote', () => {
  it('soft-deletes synced locals missing from remote', () => {
    const absent = syncedIdsAbsentFromRemote(
      [
        { id: 'local-a', serverId: 'srv-a' },
        { id: 'srv-b', serverId: 'srv-b' },
        { id: 'unsynced', serverId: null },
      ],
      new Set(['srv-b']),
    );
    expect(absent).toEqual(['local-a']);
  });

  it('keeps unsynced locals', () => {
    expect(
      syncedIdsAbsentFromRemote([{ id: 'only-local', serverId: null }], new Set()),
    ).toEqual([]);
  });
});
