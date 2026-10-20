/** Simplified SM-2. `today` and `due` are `YYYY-MM-DD`. */

export type Grade = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewState {
  due: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}

const EASE_MIN = 1.3;
const EASE_MAX = 3;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function scheduleReview(
  prev: ReviewState | null,
  grade: Grade,
  today: string,
): ReviewState {
  if (!DAY.test(today)) throw new Error('scheduleReview: today must be YYYY-MM-DD');
  const ease = prev?.ease ?? 2.5;
  const interval = prev?.intervalDays ?? 0;
  const reps = prev?.reps ?? 0;
  const lapses = prev?.lapses ?? 0;

  if (grade === 'again') {
    return {
      due: addDays(today, 1),
      intervalDays: 1,
      ease: clampEase(ease - 0.2),
      reps: 0,
      lapses: lapses + 1,
    };
  }

  const nextReps = reps + 1;
  if (grade === 'hard') {
    const nextInterval = nextReps === 1 ? 1 : Math.max(1, Math.round(interval * 1.2));
    return {
      due: addDays(today, nextInterval),
      intervalDays: nextInterval,
      ease: clampEase(ease - 0.15),
      reps: nextReps,
      lapses,
    };
  }
  if (grade === 'good') {
    const nextInterval = nextReps === 1 ? 1 : nextReps === 2 ? 6 : Math.max(1, Math.round(interval * ease));
    return {
      due: addDays(today, nextInterval),
      intervalDays: nextInterval,
      ease,
      reps: nextReps,
      lapses,
    };
  }
  const nextInterval = nextReps === 1 ? 4 : Math.max(1, Math.round(interval * ease * 1.3));
  return {
    due: addDays(today, nextInterval),
    intervalDays: nextInterval,
    ease: clampEase(ease + 0.15),
    reps: nextReps,
    lapses,
  };
}

export function addDays(day: string, days: number): string {
  if (!DAY.test(day) || !Number.isInteger(days)) throw new Error('addDays: invalid day');
  const [year, month, date] = day.split('-').map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, date));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function clampEase(ease: number): number {
  return Math.min(EASE_MAX, Math.max(EASE_MIN, Math.round(ease * 100) / 100));
}
