/** First `:::` or `::` on a line, outside inline code. */

export interface CardSeparator {
  index: number;
  marker: ':::' | '::';
}

export function findCardSeparator(line: string): CardSeparator | null {
  let inCode = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '`') {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (line.startsWith(':::', i)) return { index: i, marker: ':::' };
    if (line.startsWith('::', i) && line[i + 2] !== ':') return { index: i, marker: '::' };
  }
  return null;
}
