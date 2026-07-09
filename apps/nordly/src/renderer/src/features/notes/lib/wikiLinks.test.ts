import { describe, expect, it } from 'vitest';

import {
  buildWikiLinksWire,
  extractWikiLinks,
  resolveWikiLinks,
} from './wikiLinks';

describe('extractWikiLinks', () => {
  it('extracts simple wiki links', () => {
    expect(extractWikiLinks('See [[Idea]] for context.')).toEqual([{ linkText: 'Idea' }]);
  });

  it('uses target title from alias syntax', () => {
    expect(extractWikiLinks('[[Idea|my alias]]')).toEqual([{ linkText: 'Idea' }]);
  });

  it('dedupes repeated links', () => {
    expect(extractWikiLinks('[[A]] and [[A]] again')).toEqual([{ linkText: 'A' }]);
  });

  it('skips fenced code blocks', () => {
    const body = 'before\n```\n[[Hidden]]\n```\n[[Visible]]';
    expect(extractWikiLinks(body)).toEqual([{ linkText: 'Visible' }]);
  });

  it('skips inline code', () => {
    expect(extractWikiLinks('`[[NotLink]]` then [[Real]]')).toEqual([{ linkText: 'Real' }]);
  });

  it('handles unicode titles', () => {
    expect(extractWikiLinks('[[Идея]]')).toEqual([{ linkText: 'Идея' }]);
  });
});

describe('resolveWikiLinks', () => {
  it('matches titles case-insensitively', () => {
    const links = extractWikiLinks('[[idea]]');
    const resolved = resolveWikiLinks(links, [{ id: 'n1', title: 'Idea' }]);
    expect(resolved).toEqual([{ linkText: 'idea', targetNoteId: 'n1' }]);
  });

  it('returns null target when unresolved', () => {
    const links = extractWikiLinks('[[Missing]]');
    const resolved = resolveWikiLinks(links, [{ id: 'n1', title: 'Other' }]);
    expect(resolved[0]?.targetNoteId).toBeNull();
  });
});

describe('buildWikiLinksWire', () => {
  it('serializes unresolved links as empty target id', () => {
    expect(buildWikiLinksWire('[[X]]', [])).toEqual([{ linkText: 'X', targetNoteId: '' }]);
  });
});
