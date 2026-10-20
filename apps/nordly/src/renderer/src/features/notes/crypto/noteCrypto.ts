import { decryptText, encryptText } from '@shared/crypto/vault';
import { bytesToBase64 } from '@shared/lib/base64';

import type { Note, WireNote } from '../model/note';

const NOTE_CIPHER_VERSION = 2;

export function encodeNoteEnvelope(path: string, body: string): string {
  return JSON.stringify({ v: NOTE_CIPHER_VERSION, path, body });
}

export function decodeNoteEnvelope(raw: string): { path: string; body: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('note envelope is damaged');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('note envelope is damaged');
  }
  const row = parsed as Record<string, unknown>;
  if (row.v !== NOTE_CIPHER_VERSION) {
    throw new Error('note envelope version is not supported');
  }
  if (typeof row.path !== 'string' || row.path.length === 0) {
    throw new Error('note envelope is missing path');
  }
  if (typeof row.body !== 'string') {
    throw new Error('note envelope is missing body');
  }
  return { path: row.path, body: row.body };
}

/** IndexedDB at rest keeps title and body as separate ciphertexts. The device is the trust boundary. */
export async function encryptNoteFields(
  title: string,
  bodyMd: string,
): Promise<{ encTitle: string; encBody: string }> {
  const [encTitle, encBody] = await Promise.all([encryptText(title), encryptText(bodyMd)]);
  return { encTitle, encBody };
}

export async function decryptNoteFields(
  titleCipher: string,
  bodyCipher: string,
): Promise<{ title: string; bodyMd: string }> {
  const [title, bodyMd] = await Promise.all([decryptText(titleCipher), decryptText(bodyCipher)]);
  return { title, bodyMd };
}

export async function decryptNoteFromRemote(note: WireNote): Promise<Note> {
  if (!note.encrypted) {
    return note;
  }
  const raw = await decryptText(note.bodyMd);
  const envelope = decodeNoteEnvelope(raw);
  return {
    ...note,
    title: envelope.path,
    bodyMd: envelope.body,
    sizeBytes: new TextEncoder().encode(envelope.body).length,
  };
}

/** One AES-GCM blob holds path and body. The server title is an opaque id, not the path. */
export async function encryptNoteForRemote(
  path: string,
  bodyMd: string,
): Promise<{ encTitle: string; encBody: string }> {
  const encBody = await encryptText(encodeNoteEnvelope(path, bodyMd));
  const encTitle = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
  return { encTitle, encBody };
}
