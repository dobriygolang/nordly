import { getNote, listNotes } from '@features/notes/api/notesClient';
import { toDayKey } from '@shared/lib/dates';
import { useSessionStore } from '@shared/model/session';
import { readSettings } from '@shared/model/settings';

import { parseCards, type CardIssue, type ParsedCard } from '../lib/parseCards';
import { scheduleReview, type Grade, type ReviewState } from '../lib/scheduleReview';
import {
  getCardReview,
  listCardReviews,
  putCardReview,
  readCardsDaily,
  writeCardsDaily,
  type CardReviewRecord,
} from '../repository/cardReviewsStore';

export type { Grade, ReviewState };

export interface DeckCard {
  key: string;
  front: string;
  back: string;
  noteId: string;
  noteTitle: string;
  direction: ParsedCard['direction'];
  isNew: boolean;
}

export interface CardDuplicate {
  front: string;
  noteTitles: string[];
}

export interface CardOrphan {
  cardKey: string;
  front: string;
}

export interface CardDeck {
  queue: DeckCard[];
  issues: CardIssue[];
  duplicates: CardDuplicate[];
  orphans: CardOrphan[];
}

function requireUserId(): string {
  const userId = useSessionStore.getState().userId;
  if (!userId) throw new Error('cards: userId is not set');
  return userId;
}

export async function buildCardDeck(noteId?: string | null, today = toDayKey(new Date())): Promise<CardDeck> {
  const userId = requireUserId();
  const { notes } = await listNotes();
  const parsed: Array<ParsedCard & { noteTitle: string }> = [];
  const issues: CardIssue[] = [];
  const loaded = await mapLimit(notes, 8, (summary) => getNote(summary.id));
  for (const note of loaded) {
    const result = parseCards(note.id, note.title, note.bodyMd);
    issues.push(...result.issues);
    for (const card of result.cards) parsed.push({ ...card, noteTitle: note.title });
  }

  const byKey = new Map<string, Array<ParsedCard & { noteTitle: string }>>();
  for (const card of parsed) {
    const group = byKey.get(card.key) ?? [];
    group.push(card);
    byKey.set(card.key, group);
  }

  const duplicates: CardDuplicate[] = [];
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    if (group[0]!.direction === 'reverse') continue;
    if (noteId && !group.some((card) => card.noteId === noteId)) continue;
    duplicates.push({
      front: group[0]!.front,
      noteTitles: [...new Set(group.map((card) => card.noteTitle))],
    });
  }

  const reviews = await listCardReviews(userId);
  const reviewByKey = new Map(reviews.map((review) => [review.cardKey, review]));
  const known = new Set(byKey.keys());
  const orphans = reviews
    .filter((review) => !known.has(review.cardKey))
    .map((review) => ({ cardKey: review.cardKey, front: review.front }));

  const daily = await readCardsDaily(userId, today);
  const newBudget = Math.max(0, readSettings().flashcards.dailyNewLimit - daily.new);
  let newLeft = newBudget;
  const queue: DeckCard[] = [];

  for (const [key, group] of byKey) {
    const source = noteId ? group.find((item) => item.noteId === noteId) : group[0];
    if (!source) continue;
    const review = reviewByKey.get(key);
    if (review) {
      if (review.due <= today) queue.push(toDeckCard(source, false));
      continue;
    }
    if (newLeft <= 0) continue;
    newLeft -= 1;
    queue.push(toDeckCard(source, true));
  }
  queue.sort((a, b) => Number(a.isNew) - Number(b.isNew));

  return {
    queue,
    issues: noteId ? issues.filter((issue) => issue.noteId === noteId) : issues,
    duplicates,
    orphans,
  };
}

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) throw new Error('cards: missing note in deck scan');
      out[index] = await fn(item);
    }
  });
  await Promise.all(workers);
  return out;
}

function toDeckCard(card: ParsedCard & { noteTitle: string }, isNew: boolean): DeckCard {
  return {
    key: card.key,
    front: card.front,
    back: card.back,
    noteId: card.noteId,
    noteTitle: card.noteTitle,
    direction: card.direction,
    isNew,
  };
}

export async function gradeCard(
  card: { key: string; front: string },
  grade: Grade,
  today = toDayKey(new Date()),
): Promise<ReviewState> {
  const userId = requireUserId();
  const prev = await getCardReview(userId, card.key);
  const next = scheduleReview(prev, grade, today);
  const now = new Date().toISOString();
  const record: CardReviewRecord = {
    ...next,
    cardKey: card.key,
    front: card.front,
    lastReviewedAt: now,
    updatedAt: now,
  };
  await putCardReview(userId, record);
  const daily = await readCardsDaily(userId, today);
  await writeCardsDaily(userId, today, {
    reviewed: daily.reviewed + 1,
    new: daily.new + (prev ? 0 : 1),
  });
  return next;
}

export async function countDueCards(today = toDayKey(new Date())): Promise<number> {
  const deck = await buildCardDeck(null, today);
  return deck.queue.length;
}
