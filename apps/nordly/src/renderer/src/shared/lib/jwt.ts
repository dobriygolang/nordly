import { decodeBase64UrlText } from '@shared/lib/base64';

export function jwtExpiryMs(token: string): number {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid auth token: missing payload');

  let decoded: unknown;
  try {
    decoded = JSON.parse(decodeBase64UrlText(payload));
  } catch {
    throw new Error('Invalid auth token: malformed payload');
  }
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid auth token: payload must be an object');
  }
  const expiresAtSeconds = (decoded as Record<string, unknown>).exp;
  if (
    typeof expiresAtSeconds !== 'number' ||
    !Number.isFinite(expiresAtSeconds)
  ) {
    throw new Error('Invalid auth token: missing exp');
  }
  return expiresAtSeconds * 1000;
}
