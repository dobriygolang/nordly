import { API_BASE_URL } from '@shared/api/config';
import { requireOk } from '@shared/api/errors';
import { requireJsonObject, requireJsonString } from '@shared/api/json';
import { apiFetch } from '@shared/api/http';
import { jwtExpiryMs } from '@shared/lib/jwt';

export type AuthConfig = {
  telegramBotUsername: string;
};

function apiPath(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export async function getAuthConfig(): Promise<AuthConfig> {
  const res = await apiFetch(apiPath('/v1/auth/config'));
  requireOk(res, 'auth config');
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

export async function authTelegram(code: string): Promise<AuthTelegramResult> {
  const res = await apiFetch(apiPath('/v1/auth/telegram'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  });
  requireOk(res, 'telegram auth');

  const body = (await res.json()) as Record<string, unknown>;
  const accessToken = requireJsonString(body, 'accessToken');
  const refreshToken = requireJsonString(body, 'refreshToken');
  const user = requireJsonObject(body, 'user');
  const userId = requireJsonString(user, 'id');

  const expiresAt = jwtExpiryMs(accessToken);
  return { accessToken, refreshToken, userId, expiresAt };
}
