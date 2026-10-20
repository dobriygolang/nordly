import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setDbUserId } from '@shared/db/nordlyDb';
import { resetFakeIndexedDb } from '../../../../../../test/harness/indexedDb';

const syncEnabled = vi.hoisted(() => vi.fn(() => false));

vi.mock('@shared/sync/syncConfig', () => ({
  isSyncEnabled: syncEnabled,
}));

import {
  clearNotesSyncConsentCache,
  isNotesSyncEnabled,
  loadNotesSyncConsent,
  saveNotesSyncConsent,
} from '../notesSyncConsent';

const USER_ID = 'user-notes-sync';

describe('notes sync consent', () => {
  beforeEach(async () => {
    syncEnabled.mockReturnValue(false);
    clearNotesSyncConsentCache();
    setDbUserId(USER_ID);
    await resetFakeIndexedDb();
  });

  it('stays off until the device agrees, even when cloud sync is on', async () => {
    syncEnabled.mockReturnValue(true);
    await loadNotesSyncConsent(USER_ID);
    expect(isNotesSyncEnabled()).toBe(false);

    await saveNotesSyncConsent(USER_ID, {
      enabled: true,
      enabledAt: '2026-10-20T00:00:00.000Z',
      hintDismissed: false,
    });
    expect(isNotesSyncEnabled()).toBe(true);

    syncEnabled.mockReturnValue(false);
    expect(isNotesSyncEnabled()).toBe(false);
  });

  it('rejects a stored prefs row with the wrong shape', async () => {
    const { dbPut } = await import('@shared/db/nordlyDb');
    await dbPut('meta', {
      key: `${USER_ID}::notes_sync`,
      userId: USER_ID,
      enabled: 'yes',
      enabledAt: null,
      hintDismissed: false,
    });
    await expect(loadNotesSyncConsent(USER_ID)).rejects.toThrow(/enabled must be boolean/);
  });
});
