import { API_BASE_URL } from '@shared/api/config';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { throwIfLimitResponse } from '@shared/api/limitErrors';
import { requireJsonBoolean, requireJsonString } from '@shared/api/json';

export interface PublishStatus {
  published: boolean;
  slug?: string;
  url?: string;
  publishedAt?: string;
}

export interface ShareToWebResult {
  slug: string;
  url: string;
  publishedAt: string;
  alreadyPublished: boolean;
}

export async function remoteGetPublishStatus(noteId: string): Promise<PublishStatus> {
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/publish-status`,
    { headers: syncAuthHeaders() },
  );
  if (!resp.ok) throw new Error(`publish status: ${resp.status}`);
  const j = (await resp.json()) as Record<string, unknown>;
  const published = requireJsonBoolean(j, 'published');
  return {
    published,
    slug: published ? requireJsonString(j, 'slug') : undefined,
    url: published ? requireJsonString(j, 'url') : undefined,
    publishedAt: published ? requireJsonString(j, 'publishedAt') : undefined,
  };
}

export async function remoteShareNoteToWeb(
  noteId: string,
  plaintextMd: string,
): Promise<ShareToWebResult> {
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/share-to-web`,
    {
      method: 'POST',
      headers: syncAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ plaintextMd }),
    },
  );
  if (!resp.ok) {
    await throwIfLimitResponse(resp, 'notes_publish');
    throw new Error(`shareToWeb: ${resp.status}`);
  }
  const j = (await resp.json()) as Record<string, unknown>;
  return {
    slug: requireJsonString(j, 'slug'),
    url: requireJsonString(j, 'url'),
    publishedAt: requireJsonString(j, 'publishedAt'),
    alreadyPublished: requireJsonBoolean(j, 'alreadyPublished'),
  };
}

export async function remoteUnpublishNote(noteId: string): Promise<void> {
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/unpublish`,
    {
      method: 'POST',
      headers: syncAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ noteId }),
    },
  );
  if (!resp.ok) throw new Error(`unpublish: ${resp.status}`);
}

export async function remoteMakeNotePrivate(
  noteId: string,
  ciphertextB64: string,
): Promise<void> {
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/make-private`,
    {
      method: 'POST',
      headers: syncAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ ciphertextB64 }),
    },
  );
  if (!resp.ok) throw new Error(`makePrivate: ${resp.status}`);
}
