import { dbGet, dbGetAllByUser, dbPut } from '@shared/db/nordlyDb';

import type { ReviewState } from '../lib/scheduleReview';

export interface CardReviewRecord extends ReviewState {
  cardKey: string;
  front: string;
  lastReviewedAt: string;
  updatedAt: string;
}

export interface CardsDaily {
  reviewed: number;
  new: number;
}

interface ReviewRow {
  key: string;
  userId: string;
  cardKey?: unknown;
  front?: unknown;
  due?: unknown;
  intervalDays?: unknown;
  ease?: unknown;
  reps?: unknown;
  lapses?: unknown;
  lastReviewedAt?: unknown;
  updatedAt?: unknown;
}

function reviewKey(userId: string, cardKey: string): string {
  return `${userId}::${cardKey}`;
}

function dailyKey(userId: string, day: string): string {
  return `${userId}::cards_daily::${day}`;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`card review: ${field} must be a string`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`card review: ${field} must be a number`);
  }
  return value;
}

function requireReview(row: ReviewRow): CardReviewRecord {
  return {
    cardKey: requireString(row.cardKey, 'cardKey'),
    front: requireString(row.front, 'front'),
    due: requireString(row.due, 'due'),
    intervalDays: requireNumber(row.intervalDays, 'intervalDays'),
    ease: requireNumber(row.ease, 'ease'),
    reps: requireNumber(row.reps, 'reps'),
    lapses: requireNumber(row.lapses, 'lapses'),
    lastReviewedAt: requireString(row.lastReviewedAt, 'lastReviewedAt'),
    updatedAt: requireString(row.updatedAt, 'updatedAt'),
  };
}

export async function getCardReview(userId: string, cardKey: string): Promise<CardReviewRecord | null> {
  const row = await dbGet<ReviewRow>('card_reviews', reviewKey(userId, cardKey));
  if (!row) return null;
  return requireReview(row);
}

export async function listCardReviews(userId: string): Promise<CardReviewRecord[]> {
  const rows = await dbGetAllByUser<ReviewRow>('card_reviews', userId);
  return rows.map(requireReview);
}

export async function putCardReview(userId: string, review: CardReviewRecord): Promise<void> {
  await dbPut('card_reviews', {
    key: reviewKey(userId, review.cardKey),
    userId,
    ...review,
  });
}

export async function readCardsDaily(userId: string, day: string): Promise<CardsDaily> {
  const row = await dbGet<{ reviewed?: unknown; new?: unknown }>('meta', dailyKey(userId, day));
  if (!row) return { reviewed: 0, new: 0 };
  return {
    reviewed: requireNumber(row.reviewed, 'daily.reviewed'),
    new: requireNumber(row.new, 'daily.new'),
  };
}

export async function writeCardsDaily(userId: string, day: string, daily: CardsDaily): Promise<void> {
  await dbPut('meta', {
    key: dailyKey(userId, day),
    userId,
    reviewed: daily.reviewed,
    new: daily.new,
  });
}
