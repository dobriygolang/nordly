import { describe, expect, it } from 'vitest';

import { normalizedWikiTitles, normalizeWikiTitle } from '@shared/lib/wikiLinkText';

describe('wiki-link text helpers', () => {
  it('normalizes and deduplicates note titles', () => {
    expect([...normalizedWikiTitles([' Project ', 'project', '', 'Notes'])]).toEqual([
      'project',
      'notes',
    ]);
    expect(normalizeWikiTitle('  Mixed CASE  ')).toBe('mixed case');
  });
});
