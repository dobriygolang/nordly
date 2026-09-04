/**
 * Recovery phrase — 24 words (256-word list, 1 byte per word).
 * Wraps vault passphrase for Settings recovery flow.
 */
import { dbGet, dbPut, requireUserId } from '@shared/db/nordlyDb';
import { base64ToBytes, bytesToBase64 } from '@shared/lib/base64';

const PBKDF2_ITERATIONS = 100_000;
const IV_BYTES = 12;
const RECOVERY_WORD_COUNT = 256;
const RECOVERY_ENTROPY_BYTES = 24;

export const RECOVERY_WORDS = Object.freeze(
  (
    'ace atom axis back barn beam beta bird blue bolt book boot bulb burn ' +
    'cafe cage calm cart cave chip city clay clip cloud coal code coin cool ' +
    'core corn cube dark dawn deck desk dial disk door dove drop drum dusk ' +
    'dust east edge epic fact fair fall farm fast fern file film fire fish ' +
    'flag flat flux foam fold font fork fort frog fuel fuse gain gate gift ' +
    'glow gold gray grid grip grow gulf hail half hall hand hawk head heat ' +
    'hill hive hold hole home hope horn hub ice icon idea idle inch iron ' +
    'item jack jade jazz join jump keen keep kelp key king kite knot lake ' +
    'lamp land lane leaf lens lift lime line link lion list lock log loop ' +
    'lord luck lunar mail map mark mars mask mile mind mint mist moon moss ' +
    'moth move myth nail name nest news node north note nova oak oar ocean ' +
    'olive open orbit oval pace pack page palm park path peak pine pink pipe ' +
    'plan plot plug poem pond pool port post pure rain ramp reef ring rise ' +
    'road rock root rose ruby ruin rune rush rust sage sand seal seed ship ' +
    'shop silk site ski sky slate slip snow soil solar song star stem step ' +
    'stone storm sun surf tank tape task tide tile time toad tree trim trip ' +
    'tube tune twin unit vale vein view vine void volt vote walk wall wave ' +
    'west wind wing wire wolf wood word work yard yarn zero zone ' +
    'amber bloom crisp delta ember quartz'
  )
    .trim()
    .split(/\s+/),
);
const RECOVERY_WORD_SET = new Set(RECOVERY_WORDS);

if (
  RECOVERY_WORDS.length !== RECOVERY_WORD_COUNT ||
  RECOVERY_WORD_SET.size !== RECOVERY_WORD_COUNT
) {
  throw new Error('Recovery wordlist must contain exactly 256 unique words');
}

function wrapKey(userId: string): string {
  return `${userId}::vault_recovery_wrap`;
}

export function recoveryPhraseFromEntropy(bytes: Uint8Array): string {
  if (bytes.length !== RECOVERY_ENTROPY_BYTES) {
    throw new Error(`Recovery entropy must be exactly ${RECOVERY_ENTROPY_BYTES} bytes`);
  }
  // The list has exactly 2^8 words, so each random byte maps directly to one
  // word with no modulo reduction or rejection bias.
  return Array.from(bytes, (byte) => RECOVERY_WORDS[byte]!).join(' ');
}

export function generateRecoveryPhrase(): string {
  return recoveryPhraseFromEntropy(
    crypto.getRandomValues(new Uint8Array(RECOVERY_ENTROPY_BYTES)),
  );
}

export function normalizeRecoveryPhrase(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function validateRecoveryPhrase(phrase: string): boolean {
  const words = normalizeRecoveryPhrase(phrase).split(' ');
  if (words.length !== RECOVERY_ENTROPY_BYTES) return false;
  return words.every((word) => RECOVERY_WORD_SET.has(word));
}

async function deriveRecoveryKey(phrase: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const salt = enc.encode('nordly-recovery-v1');
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(normalizeRecoveryPhrase(phrase)),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function saveRecoveryWrap(passphrase: string, recoveryPhrase: string): Promise<void> {
  const userId = requireUserId();
  const key = await deriveRecoveryKey(recoveryPhrase);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    enc.encode(passphrase),
  );
  const ctBytes = new Uint8Array(ct);
  const out = new Uint8Array(IV_BYTES + ctBytes.length);
  out.set(iv, 0);
  out.set(ctBytes, IV_BYTES);
  await dbPut('meta', {
    key: wrapKey(userId),
    userId,
    wrappedB64: bytesToBase64(out),
  });
}

export async function hasRecoveryWrap(userId?: string): Promise<boolean> {
  const uid = userId ?? requireUserId();
  const row = await dbGet<{ wrappedB64?: string }>('meta', wrapKey(uid));
  return !!row?.wrappedB64;
}

export async function recoverPassphraseFromPhrase(recoveryPhrase: string): Promise<string> {
  if (!validateRecoveryPhrase(recoveryPhrase)) {
    throw new Error('Invalid recovery phrase — need exactly 24 words');
  }
  const userId = requireUserId();
  const row = await dbGet<{ wrappedB64?: string }>('meta', wrapKey(userId));
  if (!row?.wrappedB64) throw new Error('No recovery backup on this device');
  const buf = base64ToBytes(row.wrappedB64);
  if (buf.length <= IV_BYTES) throw new Error('Corrupted recovery backup');
  const iv = buf.slice(0, IV_BYTES);
  const ct = buf.slice(IV_BYTES);
  const key = await deriveRecoveryKey(recoveryPhrase);
  let pt: ArrayBuffer;
  try {
    pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
  } catch {
    throw new Error('Recovery phrase did not match backup');
  }
  return new TextDecoder().decode(pt);
}
