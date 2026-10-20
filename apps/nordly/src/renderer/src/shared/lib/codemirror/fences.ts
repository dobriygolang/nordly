/** Opening fence: ``` plus any info string that does not itself contain a backtick. */
export function parseOpeningFence(lineText: string): { fence: string; info: string } | null {
  const match = /^(`{3,})([^`]*)$/.exec(lineText);
  if (!match?.[1]) return null;
  return { fence: match[1], info: (match[2] ?? '').trim() };
}

/** First word of a fence info string. `go main.go` → `go`. */
export function fenceInfoWord(info: string): string {
  return info.trim().split(/\s+/)[0] ?? '';
}
