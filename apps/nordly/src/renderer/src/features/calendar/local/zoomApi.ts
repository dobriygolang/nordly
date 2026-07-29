import { vendorFetch } from '@shared/api/http';
import {
  requireZoomAccessToken,
  ZoomNotConnectedError,
  ZoomReauthError,
} from './zoomOAuth';

const ZOOM_API = 'https://api.zoom.us/v2';

export interface ZoomMeetingInput {
  topic: string;
  start?: Date;
  durationMin?: number;
}

export interface ZoomMeetingResult {
  id: string;
  joinUrl: string;
}

async function zoomFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const access = await requireZoomAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${access}`);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const resp = await vendorFetch(`${ZOOM_API}${path}`, { ...init, headers });
  if (resp.status === 401 || resp.status === 403) throw new ZoomReauthError();
  return resp;
}

export async function createZoomMeeting(input: ZoomMeetingInput): Promise<ZoomMeetingResult> {
  const topic = input.topic.trim();
  if (!topic) throw new Error('zoom meeting topic required');

  const body: Record<string, unknown> = {
    topic,
    timezone: 'UTC',
  };
  if (input.start && !Number.isNaN(input.start.getTime())) {
    body.type = 2;
    body.start_time = input.start.toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (input.durationMin && input.durationMin > 0) {
      body.duration = input.durationMin;
    }
  } else {
    body.type = 1;
  }

  const resp = await zoomFetch('/users/me/meetings', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`zoom create meeting: ${resp.status} ${text}`);
  }
  const json = (await resp.json()) as { id?: number | string; join_url?: string };
  const joinUrl = typeof json.join_url === 'string' ? json.join_url : '';
  const id = json.id != null ? String(json.id) : '';
  if (!joinUrl || !id) throw new Error('zoom create meeting: empty join_url');
  return { id, joinUrl };
}

export { ZoomNotConnectedError, ZoomReauthError };
