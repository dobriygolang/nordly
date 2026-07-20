/** Wiki-link extraction and resolution for Obsidian-style [[Title]] / [[Title|alias]] syntax. */

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

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export function normalizeWikiTitle(title: string): string {
  return title.trim().toLowerCase();
}

function segmentsWithoutInlineCode(line: string): string[] {
  const parts = line.split('`');
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    out.push(parts[i] ?? '');
  }
  return out;
}

function extractFromText(text: string, seen: Set<string>, out: WikiLinkRef[]): void {
  WIKI_LINK_RE.lastIndex = 0;
  let match = WIKI_LINK_RE.exec(text);
  while (match != null) {
    const linkText = match[1].trim();
    if (linkText) {
      const key = normalizeWikiTitle(linkText);
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ linkText });
      }
    }
    match = WIKI_LINK_RE.exec(text);
  }
}

export function extractWikiLinks(bodyMd: string): WikiLinkRef[] {
  const seen = new Set<string>();
  const out: WikiLinkRef[] = [];
  let inFence = false;

  for (const line of bodyMd.split('\n')) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    for (const segment of segmentsWithoutInlineCode(line)) {
      extractFromText(segment, seen, out);
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

export function noteTitlesSet(notes: NoteTitleRef[]): ReadonlySet<string> {
  const out = new Set<string>();
  for (const note of notes) {
    const key = normalizeWikiTitle(note.title);
    if (key) out.add(key);
  }
  return out;
}

/** Parse wiki link at click position in editor line text. */
export function wikiLinkAtPosition(
  lineText: string,
  columnInLine: number,
): { linkText: string } | null {
  WIKI_LINK_RE.lastIndex = 0;
  let match = WIKI_LINK_RE.exec(lineText);
  while (match != null) {
    const start = match.index;
    const end = start + match[0].length;
    if (columnInLine >= start && columnInLine <= end) {
      return { linkText: match[1].trim() };
    }
    match = WIKI_LINK_RE.exec(lineText);
  }
  return null;
}
