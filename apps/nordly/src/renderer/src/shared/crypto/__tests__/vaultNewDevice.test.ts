import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@shared/model/features', () => ({ isCloudEnabled: () => true }));
vi.mock('@shared/sync/syncConfig', () => ({ isCloudApiAvailable: () => true }));
vi.mock('@shared/api/http', () => ({ apiFetch: vi.fn() }));
vi.mock('@shared/api/authToken', () => ({ syncAuthHeaders: () => ({}) }));

import { apiFetch } from '@shared/api/http';
import { dbDelete, setDbUserId } from '@shared/db/nordlyDb';
import { bytesToBase64 } from '@shared/lib/base64';
import { encryptText, initVault, isVaultUnlocked, lockVault, unlockVault } from '../vault';

describe('unlock on a second device', () => {
  beforeEach(() => {
    lockVault();
    vi.resetAllMocks();
  });

  it('verifies the encrypted body instead of the opaque remote title', async () => {
    const userId = crypto.randomUUID();
    setDbUserId(userId);
    const saltB64 = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
    const passphrase = 'correct horse battery staple';
    vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify({ saltB64, initialized: false })));
    await initVault();
    vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({ saltB64 })));
    await unlockVault(passphrase);
    const encrypted = {
      encTitle: bytesToBase64(crypto.getRandomValues(new Uint8Array(16))),
      encBody: await encryptText(JSON.stringify({ v: 2, path: 'private.md', body: 'Private text' })),
    };
    lockVault();
    // A newly installed device has neither a local verifier nor cached notes.
    await dbDelete('meta', `${userId}::vault_verifier_v1`);
    await dbDelete('meta', `${userId}::vault_salt_local`);
    vi.mocked(apiFetch).mockImplementation(async (input) => {
      const path = String(input);
      if (path.endsWith('/vault/salt')) return new Response(JSON.stringify({ saltB64 }));
      if (path.endsWith('/v1/notes')) return new Response(JSON.stringify({ notes: [{ id: 'remote-note' }] }));
      if (path.endsWith('/v1/notes/remote-note')) return new Response(JSON.stringify({ note: {
        id: 'remote-note', title: encrypted.encTitle, bodyMd: encrypted.encBody, encrypted: true,
      } }));
      throw new Error(`Unexpected request: ${path}`);
    });
    await expect(unlockVault('incorrect horse battery staple')).rejects.toThrow();
    expect(isVaultUnlocked()).toBe(false);
    await unlockVault(passphrase);
    expect(isVaultUnlocked()).toBe(true);
    lockVault();
  });
});
