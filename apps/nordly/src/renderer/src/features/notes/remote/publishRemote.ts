import type {
  PublishStatus,
  PublishToWebOptions,
} from '@features/notes/model/publishOptions';
import {
  DEFAULT_PUBLISH_OPTIONS,
  shareAccessMode,
  shareExpiryPolicy,
} from '@features/notes/model/publishOptions';
import { API_BASE_URL } from '@shared/api/config';
import { requireOk } from '@shared/api/errors';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { requireJsonBoolean, requireJsonString } from '@shared/api/json';
import { publishAccessModeFromWire, publishAccessModeToWire, publishExpiryPolicyToWire } from './wireEnums';

export interface ShareToWebResult {
  slug: string;
  url: string;
  publishedAt: string;
  alreadyPublished: boolean;
}

export interface PublishedAttachmentInput {
  id: string;
  fileName: string;
  mime: string;
  dataB64: string;
}

function unwrapPublishStatus(raw: Record<string, unknown>): PublishStatus {
  const published = requireJsonBoolean(raw, 'published');
  if (!published) {
    return { published: false };
  }

  const expiresAtRaw = raw.expiresAt;
  if (expiresAtRaw != null && typeof expiresAtRaw !== 'string') {
    throw new Error('Invalid publish status: expiresAt must be a string');
  }
  const accessMode = publishAccessModeFromWire(requireJsonString(raw, 'accessMode'));
  return {
    published: true,
    slug: requireJsonString(raw, 'slug'),
    url: requireJsonString(raw, 'url'),
    publishedAt: requireJsonString(raw, 'publishedAt'),
    accessMode,
    expiresAt: typeof expiresAtRaw === 'string' && expiresAtRaw ? expiresAtRaw : undefined,
  };
}

export async function remoteGetPublishStatus(noteId: string): Promise<PublishStatus | null> {
  if (!isCloudApiAvailable()) {
    throw new Error('Cloud API unavailable');
  }
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/publish-status`,
    { headers: syncAuthHeaders() },
  );
  if (resp.status === 404) return null;
  requireOk(resp, 'publish status');
  return unwrapPublishStatus((await resp.json()) as Record<string, unknown>);
}

export async function remoteShareNoteToWeb(
  noteId: string,
  plaintextMd: string,
  options: PublishToWebOptions = DEFAULT_PUBLISH_OPTIONS,
  attachments: PublishedAttachmentInput[] = [],
): Promise<ShareToWebResult> {
  const body: Record<string, unknown> = {
    plaintextMd,
    accessMode: publishAccessModeToWire(shareAccessMode(options)),
    expiryPolicy: publishExpiryPolicyToWire(shareExpiryPolicy(options)),
    attachments: attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mime: a.mime,
      dataB64: a.dataB64,
    })),
  };
  if (options.passwordProtected && options.password) {
    body.password = options.password;
  }
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/share-to-web`,
    {
      method: 'POST',
      headers: syncAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
    },
  );
  requireOk(resp, 'shareToWeb');
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
  requireOk(resp, 'unpublish');
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
  requireOk(resp, 'makePrivate');
}
