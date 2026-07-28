import { describe, expect, it } from 'vitest';

import { nextUniqueFolderName } from '../foldersStore';

describe('nextUniqueFolderName', () => {
  it('returns base when free', () => {
    expect(nextUniqueFolderName('New folder', [])).toBe('New folder');
  });

  it('appends (1), (2), … when base is taken', () => {
    expect(nextUniqueFolderName('New folder', ['New folder'])).toBe('New folder (1)');
    expect(nextUniqueFolderName('New folder', ['New folder', 'New folder (1)'])).toBe(
      'New folder (2)',
    );
  });
});
