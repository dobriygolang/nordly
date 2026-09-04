const WIKI_LINK_PATTERN = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

export function normalizeWikiTitle(title: string): string {
  return title.trim().toLowerCase();
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
