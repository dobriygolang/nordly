import { describe, expect, it } from 'vitest';

import { proseSegments } from '@nordly-markdown/proseLines';
import {
  findWikiMatches,
  httpsLinkAt,
  parseWikiTarget,
  wikiCompletions,
  wikiMatchAt,
} from '@nordly-markdown/wikiTarget';

import { renderNordlyMarkdown } from '../../../../../../../web/src/lib/markdown/renderNordlyMarkdown';

describe('parseWikiTarget', () => {
  it('keeps a colon inside a note title', () => {
    expect(parseWikiTarget('Встреча: Q3')).toEqual({ kind: 'note', title: 'Встреча: Q3' });
    expect(parseWikiTarget('Meet: Q3')).toEqual({ kind: 'note', title: 'Meet: Q3' });
  });

  it('reads board and link keys without case', () => {
    expect(parseWikiTarget('Board: Sprint')).toEqual({ kind: 'board', title: 'Sprint' });
    expect(parseWikiTarget('LINK:https://go.dev/doc')).toEqual({
      kind: 'link',
      url: 'https://go.dev/doc',
    });
  });

  it('rejects empty values and unsafe urls', () => {
    expect(parseWikiTarget('link:')).toEqual({ kind: 'invalid', key: 'link', reason: 'empty_value' });
    expect(parseWikiTarget('board:  ')).toEqual({
      kind: 'invalid',
      key: 'board',
      reason: 'empty_value',
    });
    for (const raw of [
      'link:javascript:alert(1)',
      'link:http://go.dev',
      'link:file:///etc/passwd',
      'link:go.dev',
      'link:https://user:secret@example.com',
    ]) {
      expect(parseWikiTarget(raw)).toEqual({ kind: 'invalid', key: 'link', reason: 'bad_url' });
    }
  });
});

describe('findWikiMatches', () => {
  it('keeps an alias and an embed width', () => {
    expect(findWikiMatches('[[link:https://go.dev/doc|Go docs]]')[0]).toMatchObject({
      alias: 'Go docs',
      embed: false,
      target: { kind: 'link', url: 'https://go.dev/doc' },
    });
    expect(findWikiMatches('![[shot.png|300]]')[0]).toMatchObject({
      embed: true,
      width: 300,
      raw: 'shot.png',
      target: { kind: 'note', title: 'shot.png' },
    });
  });

  it('finds the match under the cursor', () => {
    const line = 'See [[Project|roadmap]] and [[Notes]]';
    expect(wikiMatchAt(line, 8)?.target).toEqual({ kind: 'note', title: 'Project' });
    expect(wikiMatchAt(line, 8)?.alias).toBe('roadmap');
    expect(wikiMatchAt(line, 1)).toBeNull();
  });
});

describe('httpsLinkAt', () => {
  it('returns only a credential-free https url', () => {
    const line = 'read [docs](https://go.dev/doc) and [bad](http://go.dev)';
    expect(httpsLinkAt(line, 8)).toBe('https://go.dev/doc');
    expect(httpsLinkAt(line, line.indexOf('bad'))).toBeNull();
  });
});

describe('wikiCompletions', () => {
  it('offers keys and note titles, then board titles after board:', () => {
    expect(wikiCompletions('', ['Idea'], ['Sprint'])?.map((option) => option.label)).toEqual([
      'board:',
      'link:',
      'Idea',
    ]);
    expect(wikiCompletions('link:', ['Idea'], ['Sprint'])).toBeNull();
    expect(wikiCompletions('board:sp', ['Idea'], ['Sprint'])).toEqual([
      { label: 'Sprint', apply: 'Sprint]]', keep: 6 },
    ]);
  });
});

describe('proseSegments', () => {
  it('skips fenced blocks and inline code', () => {
    const body = 'before\n```\n[[Hidden]]\n```\n`[[Code]]` [[Real]]';
    expect(proseSegments(body).map((segment) => segment.text).join('')).toBe('before [[Real]]');
  });

  it('keeps a longer fence closed across a shorter backtick line', () => {
    const body = 'before\n````\n```\n[[Hidden]]\n````\nafter [[Real]]';
    expect(proseSegments(body).map((segment) => segment.text).join('')).toBe('beforeafter [[Real]]');
  });
});

describe('renderNordlyMarkdown wiki targets', () => {
  it('renders an https link and refuses unsafe targets', () => {
    const html = renderNordlyMarkdown('See [[link:https://go.dev/doc|Go docs]]');
    expect(html).toContain('href="https://go.dev/doc"');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(html).toContain('Go docs');
    expect(html).toContain('title="go.dev"');

    const unsafe = renderNordlyMarkdown('[[link:javascript:alert(1)]] [[board:Sprint]]');
    expect(unsafe).not.toContain('href="javascript:');
    expect(unsafe).toContain('nordly-md-wiki-link--invalid');
    expect(unsafe).toContain('Sprint');
    expect(unsafe).not.toContain('href=');
  });

  it('escapes raw html', () => {
    const html = renderNordlyMarkdown('<script>alert(1)</script> [[link:https://ex.com|"><img]]');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
  });
});
