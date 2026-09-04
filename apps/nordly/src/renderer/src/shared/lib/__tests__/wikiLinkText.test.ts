import { describe, expect, it } from 'vitest';

import {
  normalizedWikiTitles,
  normalizeWikiTitle,
  wikiLinkAtPosition,
} from '@shared/lib/wikiLinkText';

describe('wiki-link text helpers', () => {
  it('normalizes and deduplicates note titles', () => {
    expect([...normalizedWikiTitles([' Project ', 'project', '', 'Notes'])]).toEqual([
      'project',
      'notes',
    ]);
    expect(normalizeWikiTitle('  Mixed CASE  ')).toBe('mixed case');
  });

  it('finds the wiki link under the cursor without shared regex state', () => {
    const line = 'See [[Project|roadmap]] and [[Notes]]';

    expect(wikiLinkAtPosition(line, 8)).toEqual({ linkText: 'Project' });
    expect(wikiLinkAtPosition(line, 31)).toEqual({ linkText: 'Notes' });
    expect(wikiLinkAtPosition(line, 1)).toBeNull();
    expect(wikiLinkAtPosition(line, 8)).toEqual({ linkText: 'Project' });
  });
});
