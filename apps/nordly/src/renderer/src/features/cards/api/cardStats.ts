import { addDays, parseDayKey, toDayKey } from '@shared/lib/dates';
import { requireUserId } from '@shared/db/nordlyDb';
import { readCardsDaily } from '../repository/cardReviewsStore';

export interface CardStats {
  todayReviewed: number;
  todayNew: number;
  weekReviewed: number;
}

/** Counts saved answers, including repeated attempts; progress stays on this device. */
export async function getCardStats(today = toDayKey(new Date())): Promise<CardStats> {
  const userId = requireUserId();
  const days = await Promise.all(Array.from({ length: 7 }, (_, index) =>
    readCardsDaily(userId, toDayKey(addDays(parseDayKey(today), -index))),
  ));
  return {
    todayReviewed: days[0]!.reviewed,
    todayNew: days[0]!.new,
    weekReviewed: days.reduce((total, day) => total + day.reviewed, 0),
  };
}
