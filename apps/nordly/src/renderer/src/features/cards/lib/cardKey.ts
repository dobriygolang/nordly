/** Stable card identity. The same question keeps its progress across notes and renames. */

export type CardDirection = 'forward' | 'reverse';

export function normalizeCardFront(front: string): string {
  return front.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** FNV-1a 64-bit, hex. Sync so parsing notes does not wait on Web Crypto. */
export function cardKey(front: string, direction: CardDirection): string {
  const normalized = normalizeCardFront(front);
  if (!normalized) throw new Error('cardKey: front is empty');
  return fnv1a64(`${direction}\0${normalized}`);
}

function fnv1a64(text: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const char of text) {
    hash ^= BigInt(char.codePointAt(0)!);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}
