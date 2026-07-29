import { describe, expect, it } from 'vitest';

import { remapVaultPath } from '../vaultOutbox';

describe('remapVaultPath', () => {
  it('remaps folder itself and children', () => {
    expect(remapVaultPath('a', 'a', 'b')).toBe('b');
    expect(remapVaultPath('a/x.md', 'a', 'b')).toBe('b/x.md');
    expect(remapVaultPath('a/nested/y.md', 'a', 'proj/a')).toBe('proj/a/nested/y.md');
  });

  it('leaves unrelated paths alone', () => {
    expect(remapVaultPath('other.md', 'a', 'b')).toBe('other.md');
    expect(remapVaultPath('ab/x.md', 'a', 'b')).toBe('ab/x.md');
  });
});
