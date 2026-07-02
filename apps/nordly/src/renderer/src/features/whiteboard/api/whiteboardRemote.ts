import { API_BASE_URL } from '@shared/api/config';
import { requireJsonNumber, requireJsonObject, requireJsonString } from '@shared/api/json';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';

export interface ShareWhiteboardResult {
  accessToken: string;
  inviteUrl: string;
  roomId: string;
  expiresIn: number;
}

export interface PublishWhiteboardResult {
  slug: string;
  url: string;
}

export async function remoteShareWhiteboard(
  sceneJson: string,
  title?: string,
): Promise<ShareWhiteboardResult> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/rooms/share-whiteboard`, {
    method: 'POST',
    headers: syncAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ sceneJson, title: title ?? '' }),
  });
  if (!resp.ok) throw new Error(`shareWhiteboard: ${resp.status}`);
  const j = (await resp.json()) as Record<string, unknown>;
  const invite = requireJsonObject(j, 'invite');
  return {
    accessToken: requireJsonString(j, 'accessToken'),
    inviteUrl: requireJsonString(invite, 'url'),
    roomId: requireJsonString(j, 'roomId'),
    expiresIn: requireJsonNumber(j, 'expiresIn'),
  };
}

export async function remotePublishWhiteboard(
  sceneJson: string,
  title?: string,
): Promise<PublishWhiteboardResult> {
  const resp = await apiFetch(`${API_BASE_URL}/v1/rooms/publish-whiteboard`, {
    method: 'POST',
    headers: syncAuthHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ sceneJson, title: title ?? '' }),
  });
  if (!resp.ok) throw new Error(`publishWhiteboard: ${resp.status}`);
  const j = (await resp.json()) as Record<string, unknown>;
  return {
    slug: requireJsonString(j, 'slug'),
    url: requireJsonString(j, 'url'),
  };
}
