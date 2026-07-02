import { API_BASE_URL } from '@shared/api/config';
import { requireJsonObject, requireJsonString } from '@shared/api/json';
import { apiFetch } from '@shared/api/http';

export type AuthConfig = {
  telegramBotUsername: string;
};

function apiPath(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const res = await apiFetch(apiPath('/v1/auth/config'));
  if (!res.ok) {
    throw new Error(`auth config ${res.status}`);
  }
  const body = (await res.json()) as Record<string, unknown>;
  return {
    telegramBotUsername: requireJsonString(body, 'telegramBotUsername'),
  };
}

export type AuthTelegramResult = {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresAt: number;
};

function readJwtExpMs(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('invalid auth token: missing payload');
  const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
  if (typeof json.exp !== 'number') throw new Error('invalid auth token: missing exp');
  return json.exp * 1000;
}

export async function authTelegram(code: string): Promise<AuthTelegramResult> {
  const res = await apiFetch(apiPath('/v1/auth/telegram'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `telegram auth ${res.status}`);
  }

  const body = (await res.json()) as Record<string, unknown>;
  const accessToken = requireJsonString(body, 'accessToken');
  const refreshToken = requireJsonString(body, 'refreshToken');
  const user = requireJsonObject(body, 'user');
  const userId = requireJsonString(user, 'id');

  const expiresAt = readJwtExpMs(accessToken);
  return { accessToken, refreshToken, userId, expiresAt };
}
