import { describe, expect, it } from 'vitest';

import {
  boardWikiTitleSpan,
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

  it('hides the board: prefix and keeps the board title', () => {
    expect(boardWikiTitleSpan('board:11')).toEqual({ start: 6, end: 8 });
    expect(boardWikiTitleSpan('Board: Sprint plan')).toEqual({ start: 7, end: 18 });
    expect(boardWikiTitleSpan('Idea')).toBeNull();
  });

  it('finds the wiki link under the cursor without shared regex state', () => {
    const line = 'See [[Project|roadmap]] and [[Notes]]';

    expect(wikiLinkAtPosition(line, 8)).toEqual({ linkText: 'Project' });
    expect(wikiLinkAtPosition(line, 31)).toEqual({ linkText: 'Notes' });
    expect(wikiLinkAtPosition(line, 1)).toBeNull();
    expect(wikiLinkAtPosition(line, 8)).toEqual({ linkText: 'Project' });
  });
});
