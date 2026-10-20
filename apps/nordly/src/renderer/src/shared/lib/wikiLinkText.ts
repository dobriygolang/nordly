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
