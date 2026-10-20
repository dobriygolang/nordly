import { describe, expect, it } from 'vitest';

import { passphraseStrength } from '../passphraseStrength';

describe('passphraseStrength', () => {
  it('rejects short and weak passwords and accepts a mixed 12-character password', () => {
    expect(passphraseStrength('short')).toBe('short');
    expect(passphraseStrength('longenough1')).toBe('weak');
    expect(passphraseStrength('Longenough12')).toBe('ok');
  });
});
