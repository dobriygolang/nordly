import { API_BASE_URL } from '@shared/api/config';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';

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

function pickStr(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

function requireStr(obj: Record<string, unknown>, ...keys: string[]): string {
  const value = pickStr(obj, ...keys);
  if (!value) throw new Error(`Invalid publish response: missing ${keys.join('/')}`);
  return value;
}

function pickBool(obj: Record<string, unknown>, ...keys: string[]): boolean {
  for (const k of keys) {
    if (obj[k] === true) return true;
  }
  return false;
}

export async function remoteGetPublishStatus(noteId: string): Promise<PublishStatus> {
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/publish-status`,
    { headers: syncAuthHeaders() },
  );
  if (!resp.ok) throw new Error(`publish status: ${resp.status}`);
  const j = (await resp.json()) as Record<string, unknown>;
  if (typeof j.published !== 'boolean') throw new Error('Invalid publish response: missing published');
  const published = pickBool(j, 'published');
  return {
    published,
    slug: published ? requireStr(j, 'slug') : undefined,
    url: published ? requireStr(j, 'url') : undefined,
    publishedAt: published ? requireStr(j, 'publishedAt', 'published_at') : undefined,
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
      body: JSON.stringify({ plaintext_md: plaintextMd }),
    },
  );
  if (!resp.ok) throw new Error(`shareToWeb: ${resp.status}`);
  const j = (await resp.json()) as Record<string, unknown>;
  if (typeof (j.alreadyPublished ?? j.already_published) !== 'boolean') {
    throw new Error('Invalid publish response: missing alreadyPublished');
  }
  return {
    slug: requireStr(j, 'slug'),
    url: requireStr(j, 'url'),
    publishedAt: requireStr(j, 'publishedAt', 'published_at'),
    alreadyPublished: pickBool(j, 'alreadyPublished', 'already_published'),
  };
}

export async function remoteUnpublishNote(noteId: string): Promise<void> {
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/unpublish`,
    {
      method: 'POST',
      headers: syncAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ note_id: noteId }),
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
      body: JSON.stringify({ ciphertext_b64: ciphertextB64 }),
    },
  );
  if (!resp.ok) throw new Error(`makePrivate: ${resp.status}`);
}
