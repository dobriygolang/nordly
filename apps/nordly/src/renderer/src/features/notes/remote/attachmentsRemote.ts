import { API_BASE_URL } from '@shared/api/config';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { requireJsonBoolean, requireJsonNumber, requireJsonString } from '@shared/api/json';

export interface RemoteAttachmentMeta {
  id: string;
  fileName: string;
  mime: string;
  encrypted: boolean;
  sizeBytes: number;
  updatedAt?: string;
}

export interface RemoteAttachment extends RemoteAttachmentMeta {
  dataB64: string;
}

function requireAttachment(j: Record<string, unknown>): RemoteAttachment {
  return {
    id: requireJsonString(j, 'id'),
    fileName: requireJsonString(j, 'fileName'),
    mime: requireJsonString(j, 'mime'),
    dataB64: requireJsonString(j, 'dataB64'),
    encrypted: requireJsonBoolean(j, 'encrypted'),
    sizeBytes: requireJsonNumber(j, 'sizeBytes'),
    updatedAt: typeof j.updatedAt === 'string' ? j.updatedAt : undefined,
  };
}

export async function remotePutAttachment(
  noteId: string,
  input: {
    id: string;
    fileName: string;
    mime: string;
    dataB64: string;
    encrypted: boolean;
  },
): Promise<RemoteAttachment> {
  if (!isCloudApiAvailable()) throw new Error('Cloud API unavailable');
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(input.id)}`,
    {
      method: 'PUT',
      headers: syncAuthHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({
        fileName: input.fileName,
        mime: input.mime,
        dataB64: input.dataB64,
        encrypted: input.encrypted,
      }),
    },
  );
  if (!resp.ok) throw new Error(`putAttachment: ${resp.status}`);
  const j = (await resp.json()) as { attachment?: Record<string, unknown> };
  if (!j.attachment) throw new Error('Invalid putAttachment response');
  return requireAttachment(j.attachment);
}

export async function remoteGetAttachment(
  noteId: string,
  id: string,
): Promise<RemoteAttachment> {
  if (!isCloudApiAvailable()) throw new Error('Cloud API unavailable');
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(id)}`,
    { headers: syncAuthHeaders() },
  );
  if (!resp.ok) throw new Error(`getAttachment: ${resp.status}`);
  const j = (await resp.json()) as { attachment?: Record<string, unknown> };
  if (!j.attachment) throw new Error('Invalid getAttachment response');
  return requireAttachment(j.attachment);
}

export async function remoteListAttachments(
  noteId: string,
): Promise<RemoteAttachmentMeta[]> {
  if (!isCloudApiAvailable()) throw new Error('Cloud API unavailable');
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/attachments`,
    { headers: syncAuthHeaders() },
  );
  if (!resp.ok) throw new Error(`listAttachments: ${resp.status}`);
  const j = (await resp.json()) as { attachments?: unknown[] };
  if (!Array.isArray(j.attachments)) throw new Error('Invalid listAttachments response');
  return j.attachments.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`Invalid listAttachments[${index}]`);
    }
    const row = item as Record<string, unknown>;
    return {
      id: requireJsonString(row, 'id'),
      fileName: requireJsonString(row, 'fileName'),
      mime: requireJsonString(row, 'mime'),
      encrypted: requireJsonBoolean(row, 'encrypted'),
      sizeBytes: requireJsonNumber(row, 'sizeBytes'),
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : undefined,
    };
  });
}

export async function remoteDeleteAttachment(noteId: string, id: string): Promise<void> {
  if (!isCloudApiAvailable()) throw new Error('Cloud API unavailable');
  const resp = await apiFetch(
    `${API_BASE_URL}/v1/notes/${encodeURIComponent(noteId)}/attachments/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: syncAuthHeaders(),
    },
  );
  if (!resp.ok && resp.status !== 404) throw new Error(`deleteAttachment: ${resp.status}`);
}
