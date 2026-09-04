import { describe, expect, it } from 'vitest';

import {
  RECOVERY_WORDS,
  normalizeRecoveryPhrase,
  recoveryPhraseFromEntropy,
  validateRecoveryPhrase,
} from '../recoveryKey';

describe('recovery phrase', () => {
  it('uses an exact 8-bit wordlist', () => {
    expect(RECOVERY_WORDS).toHaveLength(256);
    expect(new Set(RECOVERY_WORDS).size).toBe(256);
  });

  it('maps each entropy byte directly without modulo bias', () => {
    const entropy = Uint8Array.from(
      { length: 24 },
      (_, index) => (250 + index) % 256,
    );

    expect(recoveryPhraseFromEntropy(entropy).split(' ')).toEqual(
      Array.from(entropy, (byte) => RECOVERY_WORDS[byte]),
    );
  });

  it('requires exactly 24 bytes of entropy', () => {
    expect(() => recoveryPhraseFromEntropy(new Uint8Array(23))).toThrow(
      'Recovery entropy must be exactly 24 bytes',
    );
  });

  it('normalizes and validates exactly 24 known words', () => {
    const phrase = RECOVERY_WORDS.slice(0, 24).join(' ');
    expect(normalizeRecoveryPhrase(`  ${phrase.toUpperCase().replaceAll(' ', '  ')}  `)).toBe(
      phrase,
    );
    expect(validateRecoveryPhrase(phrase)).toBe(true);
    expect(validateRecoveryPhrase(RECOVERY_WORDS.slice(0, 23).join(' '))).toBe(false);
    expect(validateRecoveryPhrase(`${RECOVERY_WORDS.slice(0, 23).join(' ')} unknown`)).toBe(false);
  });
});
