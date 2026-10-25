import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/publishPayload', () => ({ collectPublishPayload: vi.fn(async () => ({ body: 'updated', attachments: [] })) }));
vi.mock('../../remote/publishRemote', () => ({ remoteGetPublishStatus: vi.fn(), remoteShareNoteToWeb: vi.fn() }));
import { remoteGetPublishStatus, remoteShareNoteToWeb } from '../../remote/publishRemote';
import { collectPublishPayload } from '../../lib/publishPayload';
import { PublishAccessMode } from '../../model/publishOptions';
import { refreshPublishedContent } from '../publishSync';
beforeEach(() => vi.clearAllMocks());
describe('live published content', () => {
  it('does not upload plaintext for an unpublished note', async () => {
    vi.mocked(remoteGetPublishStatus).mockResolvedValue({ published: false });
    await refreshPublishedContent('remote', 'local', 'Title', 'updated');
    expect(collectPublishPayload).not.toHaveBeenCalled();
    expect(remoteShareNoteToWeb).not.toHaveBeenCalled();
  });
  it('refreshes the same password link without renewing its expiry', async () => {
    vi.mocked(remoteGetPublishStatus).mockResolvedValue({ published: true, accessMode: PublishAccessMode.Password, slug: 'same-slug', url: 'https://example.test/same-slug', publishedAt: '2026-01-01T00:00:00Z', expiresAt: '2099-01-01T00:00:00Z' });
    await refreshPublishedContent('remote', 'local', 'Title', 'updated');
    expect(remoteShareNoteToWeb).toHaveBeenCalledWith('remote', 'updated', 'Title', { passwordProtected: true, password: '', expiresInDays: 0 }, [], { expectedSlug: 'same-slug' });
  });
  it('leaves the durable sync operation pending on publication failure', async () => {
    vi.mocked(remoteGetPublishStatus).mockRejectedValue(new Error('offline'));
    await expect(refreshPublishedContent('remote', 'local', 'Title', 'updated')).rejects.toThrow('offline');
  });
});
