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

export function parseCards(noteId: string, _noteTitle: string, bodyMd: string): {
  cards: ParsedCard[];
  issues: CardIssue[];
} {
  const cards: ParsedCard[] = [];
  const issues: CardIssue[] = [];

  for (const row of markdownLines(bodyMd)) {
    if (row.inFence) continue;
    const prefix = LIST_PREFIX.exec(row.text)?.[0].length ?? 0;
    const body = row.text.slice(prefix);
    const separator = findCardSeparator(body);
    if (!separator) continue;
    const front = body.slice(0, separator.index).trim();
    const back = body.slice(separator.index + separator.marker.length).trim();
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

function makeCard(
  noteId: string,
  line: number,
  front: string,
  back: string,
  direction: CardDirection,
): ParsedCard {
  return { key: cardKey(front, direction), front, back, noteId, line, direction };
}
