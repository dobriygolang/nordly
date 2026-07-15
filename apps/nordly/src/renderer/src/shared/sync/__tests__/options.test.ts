import { describe, expect, it } from 'vitest';

import { mergeSyncOptions } from '@shared/sync/options';

describe('mergeSyncOptions', () => {
  it('preserves explicit retry intent and upgrades push-only to a full sync', () => {
    expect(
      mergeSyncOptions(
        { explicit: true, pushOnly: true },
        { retry: true, pushOnly: false },
      ),
    ).toEqual({
      explicit: true,
      retry: true,
      pushOnly: false,
    });
  });

  it('keeps a batch push-only only when every request is push-only', () => {
    expect(mergeSyncOptions({ pushOnly: true }, { pushOnly: true })).toEqual({
      explicit: undefined,
      retry: undefined,
      pushOnly: true,
    });
  });

  it('keeps an absent option set absent', () => {
    expect(mergeSyncOptions(undefined, undefined)).toBeUndefined();
  });
});
