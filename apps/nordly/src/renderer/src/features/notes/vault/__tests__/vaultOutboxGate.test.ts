import { beforeEach, describe, expect, it, vi } from 'vitest';

const consent = vi.hoisted(() => ({
  isNotesSyncEnabled: vi.fn(() => false),
}));
const outbox = vi.hoisted(() => ({
  enqueueOutbox: vi.fn(),
}));
const scheduleSync = vi.hoisted(() => vi.fn());

vi.mock('@features/notes/lib/notesSyncConsent', () => consent);
vi.mock('@shared/sync/outbox', () => outbox);
vi.mock('@shared/sync/SyncEngine', () => ({
  scheduleSync,
}));

import { enqueueVaultFilePut } from '../vaultOutbox';

describe('enqueueVaultFilePut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes nothing while notes sync is off', async () => {
    await enqueueVaultFilePut('a.md', '# hi', 'md', 1);
    expect(outbox.enqueueOutbox).not.toHaveBeenCalled();
    expect(scheduleSync).not.toHaveBeenCalled();
  });

  it('queues a markdown file when notes sync is on', async () => {
    consent.isNotesSyncEnabled.mockReturnValue(true);
    outbox.enqueueOutbox.mockResolvedValue(undefined);
    await enqueueVaultFilePut('a.md', '# hi', 'md', 1);
    expect(outbox.enqueueOutbox).toHaveBeenCalledOnce();
    expect(scheduleSync).toHaveBeenCalledOnce();
  });
});
