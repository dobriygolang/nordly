const WIKI_LINK_PATTERN = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export function normalizeWikiTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** Note text `[[board:Title]]` opens a whiteboard instead of another note. */
export const BOARD_WIKI_PREFIX = 'board:';

export function boardTitleFromWikiLink(linkText: string): string | null {
  const trimmed = linkText.trim();
  if (!trimmed.toLowerCase().startsWith(BOARD_WIKI_PREFIX)) return null;
  const title = trimmed.slice(BOARD_WIKI_PREFIX.length).trim();
  return title || null;
}

/** Offsets of the visible board title inside the raw `[[…]]` target, excluding `board:`. */
export function boardWikiTitleSpan(rawTarget: string): { start: number; end: number } | null {
  const title = boardTitleFromWikiLink(rawTarget);
  if (!title) return null;
  const prefixAt = rawTarget.toLowerCase().indexOf(BOARD_WIKI_PREFIX);
  if (prefixAt < 0) return null;
  const afterPrefix = prefixAt + BOARD_WIKI_PREFIX.length;
  const lead = rawTarget.slice(afterPrefix).length - rawTarget.slice(afterPrefix).trimStart().length;
  const start = afterPrefix + lead;
  return { start, end: start + title.length };
}

export function normalizedWikiTitles(titles: readonly string[]): ReadonlySet<string> {
  const normalized = new Set<string>();
  for (const title of titles) {
    const value = normalizeWikiTitle(title);
    if (value) normalized.add(value);
  }
  return normalized;
}

export function wikiLinkAtPosition(
  lineText: string,
  columnInLine: number,
): { linkText: string } | null {
  for (const match of lineText.matchAll(WIKI_LINK_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    if (columnInLine >= start && columnInLine <= end) {
      return { linkText: match[1]!.trim() };
    }
  }
  return null;
}
