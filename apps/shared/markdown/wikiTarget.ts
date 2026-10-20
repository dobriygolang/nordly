/** Shared `[[key:value]]` parser for the desktop editor and the published-note page. */

const REGISTERED_KEYS = new Set(['board', 'link']);

export type WikiTarget =
  | { kind: 'note'; title: string }
  | { kind: 'board'; title: string }
  | { kind: 'link'; url: string }
  | { kind: 'invalid'; key: string; reason: 'bad_url' | 'empty_value' };

export interface WikiMatch {
  from: number;
  to: number;
  /** Text inside the brackets, before `|`. */
  raw: string;
  target: WikiTarget;
  alias: string | null;
  embed: boolean;
  width: number | null;
}

export interface WikiCompletionOption {
  label: string;
  apply: string;
  /** How many characters after `[[` the completion leaves in place. */
  keep: number;
}

const MAX_EMBED_WIDTH = 2000;

export function parseWikiTarget(raw: string): WikiTarget {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'invalid', key: '', reason: 'empty_value' };
  const keyed = /^([a-z]+):(.*)$/i.exec(trimmed);
  if (!keyed?.[1]) return { kind: 'note', title: trimmed };
  const key = keyed[1].toLowerCase();
  if (!REGISTERED_KEYS.has(key)) return { kind: 'note', title: trimmed };
  const value = (keyed[2] ?? '').trim();
  if (!value) return { kind: 'invalid', key, reason: 'empty_value' };
  if (key === 'board') return { kind: 'board', title: value };
  if (!isCredentialFreeHttps(value)) return { kind: 'invalid', key: 'link', reason: 'bad_url' };
  return { kind: 'link', url: value };
}

/** Host of a link this module already accepted. */
export function httpsUrlHost(url: string): string {
  return new URL(url).host;
}

/** Visible label for a link with no alias: the URL without the `https://` scheme. */
export function linkLabel(url: string): string {
  return url.replace(/^https:\/\//i, '');
}

export function findWikiMatches(line: string): WikiMatch[] {
  const found: WikiMatch[] = [];
  const re = /(!?)\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g;
  for (const match of line.matchAll(re)) {
    const raw = (match[2] ?? '').trim();
    const pipe = match[3]?.trim() ?? '';
    const embed = match[1] === '!';
    let alias: string | null = null;
    let width: number | null = null;
    if (embed) {
      width = positiveWidth(pipe);
    } else if (pipe) {
      alias = pipe;
    }
    const start = match.index ?? 0;
    found.push({
      from: start,
      to: start + match[0].length,
      raw,
      target: parseWikiTarget(raw),
      alias,
      embed,
      width,
    });
  }
  return found;
}

export function wikiMatchAt(line: string, column: number): WikiMatch | null {
  for (const match of findWikiMatches(line)) {
    if (column >= match.from && column <= match.to) return match;
  }
  return null;
}

/** `[label](https://…)` under the cursor. Images and non-https URLs are ignored. */
export function httpsLinkAt(line: string, column: number): string | null {
  const re = /(?<!!)\[([^\]]+)\]\(([^)\s]+)\)/g;
  for (const match of line.matchAll(re)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (column < start || column > end) continue;
    const url = (match[2] ?? '').trim();
    if (!isCredentialFreeHttps(url)) return null;
    return url;
  }
  return null;
}

export function wikiCompletions(
  typed: string,
  noteTitles: readonly string[],
  boardTitles: readonly string[],
): WikiCompletionOption[] | null {
  const lower = typed.toLowerCase();
  if (lower.startsWith('link:')) return null;
  if (lower.startsWith('board:')) {
    const query = typed.slice('board:'.length).trim().toLowerCase();
    const options = boardTitles
      .filter((title) => title.trim().length > 0 && title.toLowerCase().includes(query))
      .slice(0, 12)
      .map((title) => ({ label: title, apply: `${title}]]`, keep: 'board:'.length }));
    return options.length > 0 ? options : null;
  }
  const keys = (['board:', 'link:'] as const)
    .filter((key) => key.startsWith(lower))
    .map((key) => ({ label: key, apply: key, keep: 0 }));
  const notes = noteTitles
    .filter((title) => title.trim().length > 0 && title.toLowerCase().includes(lower.trim()))
    .slice(0, 12)
    .map((title) => ({ label: title, apply: `${title}]]`, keep: 0 }));
  const options = [...keys, ...notes];
  return options.length > 0 ? options : null;
}

function positiveWidth(pipe: string): number | null {
  if (!/^\d+$/.test(pipe)) return null;
  const width = Number(pipe);
  if (!Number.isInteger(width) || width < 1 || width > MAX_EMBED_WIDTH) return null;
  return width;
}

function isCredentialFreeHttps(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && url.hostname.length > 0 && url.username === '' && url.password === '';
}
