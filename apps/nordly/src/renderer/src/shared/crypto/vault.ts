/**
 * E2EE vault — PBKDF2-SHA256 (200k) + AES-256-GCM.
 * Derived key lives in module memory only; cleared on lock / logout.
 */
import { isCloudEnabled } from '@shared/model/features';
import { API_BASE_URL } from '@shared/api/config';
import { syncAuthHeaders } from '@shared/api/authToken';
import { apiFetch } from '@shared/api/http';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { dbDelete, dbGet, dbGetAllByUser, dbPut, requireUserId } from '@shared/db/nordlyDb';

let derivedKey: CryptoKey | null = null;
let derivedKeyUserId: string | null = null;

type Listener = (unlocked: boolean) => void;
const listeners = new Set<Listener>();

export function subscribeVault(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(unlocked: boolean): void {
  for (const fn of listeners) {
    fn(unlocked);
  }
}

export function isVaultUnlocked(): boolean {
  return derivedKey !== null;
}

interface SaltResponse {
  saltB64?: string;
  initialized?: boolean;
}

function requireSaltB64(j: SaltResponse): string {
  if (typeof j.saltB64 !== 'string' || j.saltB64.length === 0) {
    throw new Error('vault response missing saltB64');
  }
  return j.saltB64;
}

export async function initVault(): Promise<{ saltB64: string; isNewVault: boolean }> {
  if (!isCloudEnabled()) {
    const { saltB64, isNew } = await initLocalVaultSalt();
    if (isNew) await markVerifierPending();
    return { saltB64, isNewVault: isNew };
  }

  const resp = await apiFetch(`${API_BASE_URL}/v1/notes/vault/init`, {
    method: 'POST',
    headers: syncAuthHeaders({ 'content-type': 'application/json' }),
    body: '{}',
  });
  if (!resp.ok) throw new Error(`vault init: ${resp.status}`);
  const j = (await resp.json()) as SaltResponse;
  const saltB64 = requireSaltB64(j);
  await cacheLocalSalt(saltB64);
  if (typeof j.initialized !== 'boolean') {
    throw new Error('vault init response missing initialized');
  }
  const isNewVault = !j.initialized;
  if (isNewVault) await markVerifierPending();
  return { saltB64, isNewVault };
}

function localSaltKey(userId: string): string {
  return `${userId}::vault_salt_local`;
}

async function cacheLocalSalt(saltB64: string): Promise<void> {
  const userId = requireUserId();
  await dbPut('meta', { key: localSaltKey(userId), userId, saltB64 });
}

async function initLocalVaultSalt(): Promise<{ saltB64: string; isNew: boolean }> {
  const userId = requireUserId();
  const key = localSaltKey(userId);
  const existing = await dbGet<{ saltB64: string }>('meta', key);
  if (existing?.saltB64) return { saltB64: existing.saltB64, isNew: false };
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const saltB64 = base64Encode(salt);
  await dbPut('meta', { key, userId, saltB64 });
  return { saltB64, isNew: true };
}

export async function fetchVaultSalt(): Promise<string | null> {
  const userId = requireUserId();
  const localKey = localSaltKey(userId);
  const local = await dbGet<{ saltB64: string }>('meta', localKey);

  if (!isCloudApiAvailable()) {
    return local?.saltB64 ?? null;
  }

  const resp = await apiFetch(`${API_BASE_URL}/v1/notes/vault/salt`, { headers: syncAuthHeaders() });
  if (resp.status === 404) return local?.saltB64 ?? null;
  if (!resp.ok) {
    throw new Error(`vault salt: ${resp.status}`);
  }
  const j = (await resp.json()) as SaltResponse;
  const saltB64 = requireSaltB64(j);
  await cacheLocalSalt(saltB64);
  return saltB64;
}

const PBKDF2_ITERATIONS = 200_000;
const KEY_BITS = 256;
const IV_BYTES = 12;
const VERIFIER_PLAINTEXT = 'nordly-vault-verifier-v1';

function verifierKey(userId: string): string {
  return `${userId}::vault_verifier_v1`;
}

function verifierPendingKey(userId: string): string {
  return `${userId}::vault_verifier_pending_v1`;
}

async function markVerifierPending(): Promise<void> {
  const userId = requireUserId();
  await dbPut('meta', { key: verifierPendingKey(userId), userId, pending: true });
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function unlockVault(passphrase: string): Promise<void> {
  if (passphrase.length < 8) {
    throw new Error('Passphrase must be at least 8 characters');
  }
  const saltB64 = await fetchVaultSalt();
  if (!saltB64) {
    throw new Error('Vault not initialised');
  }
  const userId = requireUserId();
  const salt = base64Decode(saltB64);
  const candidate = await deriveKey(passphrase, salt);
  await verifyCandidateKey(candidate, userId);
  derivedKey = candidate;
  derivedKeyUserId = userId;
  notify(true);
}

export function lockVault(): void {
  derivedKey = null;
  derivedKeyUserId = null;
  notify(false);
}

export async function encryptText(plaintext: string): Promise<string> {
  const key = requireCurrentKey();
  return encryptWithKey(key, new TextEncoder().encode(plaintext));
}

/** Encrypt raw bytes → base64(IV ‖ ciphertext). Same AES-GCM envelope as text. */
export async function encryptBytes(plaintext: Uint8Array): Promise<string> {
  const key = requireCurrentKey();
  return encryptWithKey(key, plaintext);
}

async function encryptWithKey(key: CryptoKey, plaintext: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext as BufferSource,
  );
  const ctBytes = new Uint8Array(ct);
  const out = new Uint8Array(IV_BYTES + ctBytes.length);
  out.set(iv, 0);
  out.set(ctBytes, IV_BYTES);
  return base64Encode(out);
}

export async function decryptText(b64: string): Promise<string> {
  const pt = await decryptBytesWithKey(requireCurrentKey(), b64);
  return new TextDecoder().decode(pt);
}

/** Decrypt base64(IV ‖ ciphertext) → raw bytes. */
export async function decryptBytes(b64: string): Promise<Uint8Array> {
  return decryptBytesWithKey(requireCurrentKey(), b64);
}

async function decryptWithKey(key: CryptoKey, b64: string): Promise<string> {
  const pt = await decryptBytesWithKey(key, b64);
  return new TextDecoder().decode(pt);
}

async function decryptBytesWithKey(key: CryptoKey, b64: string): Promise<Uint8Array> {
  const buf = base64Decode(b64);
  if (buf.length <= IV_BYTES) throw new Error('Invalid ciphertext');
  const iv = buf.slice(0, IV_BYTES);
  const ct = buf.slice(IV_BYTES);
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
  } catch {
    throw new Error('Decryption failed — wrong passphrase or corrupted data');
  }
  return new Uint8Array(pt);
}

function requireCurrentKey(): CryptoKey {
  if (!derivedKey || derivedKeyUserId !== requireUserId()) {
    lockVault();
    throw new Error('Vault locked');
  }
  return derivedKey;
}

async function verifyCandidateKey(key: CryptoKey, userId: string): Promise<void> {
  const verifier = await dbGet<{ ciphertextB64?: string }>('meta', verifierKey(userId));
  if (verifier) {
    if (typeof verifier.ciphertextB64 !== 'string' || verifier.ciphertextB64.length === 0) {
      throw new Error('Vault verifier is corrupted');
    }
    const plaintext = await decryptWithKey(key, verifier.ciphertextB64);
    if (plaintext !== VERIFIER_PLAINTEXT) throw new Error('Vault verifier mismatch');
    return;
  }

  const pending = await dbGet<{ pending?: boolean }>('meta', verifierPendingKey(userId));
  if (pending?.pending === true) {
    await saveVerifier(key, userId);
    return;
  }

  const sample = await findAuthenticatedCiphertext(userId);
  if (!sample) {
    throw new Error(
      'Cannot verify this vault passphrase: no authenticated verifier or encrypted note is available',
    );
  }
  await decryptWithKey(key, sample);
  await saveVerifier(key, userId);
}

async function saveVerifier(key: CryptoKey, userId: string): Promise<void> {
  const ciphertextB64 = await encryptWithKey(key, new TextEncoder().encode(VERIFIER_PLAINTEXT));
  await dbPut('meta', { key: verifierKey(userId), userId, ciphertextB64 });
  await dbDelete('meta', verifierPendingKey(userId));
}

async function findAuthenticatedCiphertext(userId: string): Promise<string | null> {
  const localRows = await dbGetAllByUser<{
    userId: string;
    deleted?: boolean;
    atRestEncrypted?: boolean;
    title?: string;
    bodyMd?: string;
  }>('notes', userId);
  const local = localRows.find(
    (row) =>
      !row.deleted &&
      row.atRestEncrypted === true &&
      (typeof row.title === 'string' || typeof row.bodyMd === 'string'),
  );
  if (local) {
    return typeof local.title === 'string' && local.title.length > 0 ? local.title : local.bodyMd ?? null;
  }

  if (!isCloudApiAvailable()) return null;
  const listResp = await apiFetch(`${API_BASE_URL}/v1/notes`, { headers: syncAuthHeaders() });
  if (!listResp.ok) throw new Error(`vault verifier note list: ${listResp.status}`);
  const listBody = (await listResp.json()) as { notes?: unknown[] };
  if (!Array.isArray(listBody.notes)) throw new Error('Invalid vault verifier note list');

  for (const item of listBody.notes) {
    if (typeof item !== 'object' || item === null || typeof (item as { id?: unknown }).id !== 'string') {
      throw new Error('Invalid vault verifier note summary');
    }
    const id = (item as { id: string }).id;
    const noteResp = await apiFetch(`${API_BASE_URL}/v1/notes/${encodeURIComponent(id)}`, {
      headers: syncAuthHeaders(),
    });
    if (!noteResp.ok) throw new Error(`vault verifier note: ${noteResp.status}`);
    const noteBody = (await noteResp.json()) as { note?: Record<string, unknown> };
    const note = noteBody.note;
    if (!note) throw new Error('Invalid vault verifier note response');
    if (note.encrypted !== true) continue;
    if (typeof note.title === 'string' && note.title.length > 0) return note.title;
    if (typeof note.bodyMd === 'string' && note.bodyMd.length > 0) return note.bodyMd;
    throw new Error('Encrypted vault note is missing ciphertext');
  }
  return null;
}

function base64Encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64Decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
