import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@shared/api/http', () => ({ apiFetch: vi.fn() }));
vi.mock('@shared/api/authToken', () => ({ syncAuthHeaders: (headers = {}) => headers }));
vi.mock('@shared/sync/syncConfig', () => ({ isCloudApiAvailable: () => true }));
import { apiFetch } from '@shared/api/http';
import { remoteShareNoteToWeb } from '../publishRemote';
const options = { passwordProtected: true, password: '', expiresInDays: 0 as const };
const active = { published: true, slug: 'same', url: 'https://example.test/same', publishedAt: '2026-01-01T00:00:00Z', accessMode: 'PUBLISH_ACCESS_MODE_PASSWORD' };
beforeEach(() => vi.mocked(apiFetch).mockReset());
describe('content refresh HTTP contract', () => {
  it('never falls back to ordinary share when the server lacks the refresh route', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(Response.json(active));
    await expect(remoteShareNoteToWeb('id', 'updated', 'Title', options, [], { expectedSlug: 'same' })).rejects.toThrow('Update the notes service');
    expect(String(vi.mocked(apiFetch).mock.calls[0]![0])).toContain('/refresh-published-content');
    expect(vi.mocked(apiFetch).mock.calls.some(([url]) => String(url).endsWith('/share-to-web'))).toBe(false);
    const body = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0]![1]!.body));
    expect(body).toMatchObject({ contentOnly: true, expectedSlug: 'same' });
  });
  it('accepts a concurrent revocation without creating a new share', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response('', { status: 404 })).mockResolvedValueOnce(Response.json({ published: false }));
    await expect(remoteShareNoteToWeb('id', 'updated', 'Title', options, [], { expectedSlug: 'same' })).resolves.toBeNull();
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
