/** Wiki-link extraction and resolution for Obsidian-style [[Title]] / [[Title|alias]] syntax. */

import { findWikiMatches } from '@nordly-markdown/wikiTarget';
import { proseSegments } from '@nordly-markdown/proseLines';
import { normalizeWikiTitle } from '@shared/lib/wikiLinkText';

export interface WikiLinkRef {
  linkText: string;
}

export interface ResolvedWikiLink {
  linkText: string;
  targetNoteId: string | null;
}

export interface WikiLinkWire {
  linkText: string;
  targetNoteId: string;
}

export interface NoteTitleRef {
  id: string;
  title: string;
}

export function extractWikiLinks(bodyMd: string): WikiLinkRef[] {
  const seen = new Set<string>();
  const out: WikiLinkRef[] = [];

  for (const segment of proseSegments(bodyMd)) {
    for (const match of findWikiMatches(segment.text)) {
      if (match.embed || match.target.kind !== 'note') continue;
      const linkText = match.target.title;
      if (!linkText) continue;
      const key = normalizeWikiTitle(linkText);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ linkText });
    }
  }

  return out;
}

export function resolveWikiLinks(
  links: WikiLinkRef[],
  notes: NoteTitleRef[],
): ResolvedWikiLink[] {
  const byTitle = new Map<string, string>();
  for (const note of notes) {
    const key = normalizeWikiTitle(note.title);
    if (!key || byTitle.has(key)) continue;
    byTitle.set(key, note.id);
  }

  return links.map((link) => ({
    linkText: link.linkText,
    targetNoteId: byTitle.get(normalizeWikiTitle(link.linkText)) ?? null,
  }));
}

export function toWikiLinkWire(links: ResolvedWikiLink[]): WikiLinkWire[] {
  return links.map((l) => {
    if (l.targetNoteId === null) {
      // Proto3 wire: empty string means unresolved (NULL in note_links).
      return { linkText: l.linkText, targetNoteId: '' };
    }
    if (!l.targetNoteId.trim()) {
      throw new Error('wiki link targetNoteId must be null or a non-empty id');
    }
    return { linkText: l.linkText, targetNoteId: l.targetNoteId };
  });
}

export function buildWikiLinksWire(bodyMd: string, notes: NoteTitleRef[]): WikiLinkWire[] {
  const extracted = extractWikiLinks(bodyMd);
  const resolved = resolveWikiLinks(extracted, notes);
  return toWikiLinkWire(resolved);
}
