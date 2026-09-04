const ENCODE_CHUNK_BYTES = 0x2000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += ENCODE_CHUNK_BYTES) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        offset,
        Math.min(offset + ENCODE_CHUNK_BYTES, bytes.length),
      ),
    );
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw new Error('Invalid base64url value');
  }
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    Math.ceil(normalized.length / 4) * 4,
    '=',
  );
  return base64ToBytes(padded);
}

export function decodeBase64UrlText(value: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(
    base64UrlToBytes(value),
  );
}
