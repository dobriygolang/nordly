/** One `![alt](href)` on a single line. `from`/`to` are offsets within that line. */
export interface MarkdownImageMatch {
  from: number;
  to: number;
  alt: string;
  href: string;
  width: number | null;
}

/**
 * CommonMark destinations, plus unencoded spaces (`img/my pic.png`) and
 * angle-bracket destinations (`<img/my pic.png>`). `%20` is left for the resolver.
 */
export function findMarkdownImages(line: string): MarkdownImageMatch[] {
  const found: MarkdownImageMatch[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const start = line.indexOf('![', cursor);
    if (start < 0) break;
    const altEnd = line.indexOf(']', start + 2);
    if (altEnd < 0 || line[altEnd + 1] !== '(') {
      cursor = start + 2;
      continue;
    }
    const destination = readImageDestination(line, altEnd + 2);
    if (!destination) {
      cursor = start + 2;
      continue;
    }
    const alt = splitAltWidth(line.slice(start + 2, altEnd));
    found.push({
      from: start,
      to: destination.end,
      alt: alt.alt,
      href: destination.href,
      width: alt.width,
    });
    cursor = destination.end;
  }
  return found;
}

function readImageDestination(
  line: string,
  openParen: number,
): { href: string; end: number } | null {
  if (line[openParen] === '<') {
    const close = line.indexOf('>', openParen + 1);
    if (close < 0 || line[close + 1] !== ')') return null;
    const href = line.slice(openParen + 1, close).trim();
    if (!href) return null;
    return { href, end: close + 2 };
  }
  const close = line.indexOf(')', openParen);
  if (close < 0) return null;
  const href = stripOptionalTitle(line.slice(openParen, close).trim());
  if (!href) return null;
  return { href, end: close + 1 };
}

function stripOptionalTitle(raw: string): string {
  const titled = /^(.*?)\s+"[^"]*"$/.exec(raw);
  return (titled?.[1] ?? raw).trim();
}

function splitAltWidth(alt: string): { alt: string; width: number | null } {
  const sized = /^(.*)\|(\d+)$/.exec(alt);
  if (!sized) return { alt, width: null };
  const width = Number(sized[2]);
  if (!Number.isInteger(width) || width < 1 || width > 2000) return { alt, width: null };
  return { alt: (sized[1] ?? '').trim(), width };
}
