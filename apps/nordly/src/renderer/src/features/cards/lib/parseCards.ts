import { markdownLines } from '@nordly-markdown/proseLines';
import { findCardSeparator } from '@nordly-markdown/cardLine';

import { cardKey, type CardDirection } from './cardKey';

export interface ParsedCard {
  key: string;
  front: string;
  back: string;
  noteId: string;
  line: number;
  direction: CardDirection;
}

export interface CardIssue {
  noteId: string;
  line: number;
  reason: 'empty_front' | 'empty_back';
}

const LIST_PREFIX = /^\s*[-*+]\s+(?:\[[ xX]\]\s+)?/;

/** Unique keys in one note. `:::` is two keys; repeated lines stay one key. */
export function countNoteCards(noteId: string, noteTitle: string, bodyMd: string): number {
  const keys = new Set<string>();
  for (const card of parseCards(noteId, noteTitle, bodyMd).cards) keys.add(card.key);
  return keys.size;
}

export function parseCards(noteId: string, _noteTitle: string, bodyMd: string): {
  cards: ParsedCard[];
  issues: CardIssue[];
} {
  const cards: ParsedCard[] = [];
  const issues: CardIssue[] = [];

  for (const row of markdownLines(bodyMd)) {
    if (row.inFence) continue;
    const prefix = LIST_PREFIX.exec(row.text)?.[0].length ?? 0;
    const body = unwrapWholeWiki(row.text.slice(prefix).trim());
    const separator = findCardSeparator(body);
    if (!separator) continue;
    const front = unwrapWholeWiki(body.slice(0, separator.index).trim());
    const back = unwrapWholeWiki(body.slice(separator.index + separator.marker.length).trim());
    if (!front) issues.push({ noteId, line: row.line, reason: 'empty_front' });
    if (!back) issues.push({ noteId, line: row.line, reason: 'empty_back' });
    if (!front || !back) continue;
    cards.push(makeCard(noteId, row.line, front, back, 'forward'));
    if (separator.marker === ':::') {
      cards.push(makeCard(noteId, row.line, back, front, 'reverse'));
    }
  }

  return { cards, issues };
}

/** `[[question ::: answer]]` is one card line. `[[q]] :: [[a]]` is not one wiki. */
function unwrapWholeWiki(line: string): string {
  if (!line.startsWith('[[') || !line.endsWith(']]')) return line;
  let depth = 0;
  for (let i = 0; i < line.length - 1; i += 1) {
    if (line.startsWith('[[', i)) {
      depth += 1;
      i += 1;
      continue;
    }
    if (line.startsWith(']]', i)) {
      depth -= 1;
      if (depth === 0) return i === line.length - 2 ? line.slice(2, -2).trim() : line;
      i += 1;
    }
  }
  return line;
}

function makeCard(
  noteId: string,
  line: number,
  front: string,
  back: string,
  direction: CardDirection,
): ParsedCard {
  return { key: cardKey(front, direction), front, back, noteId, line, direction };
}
