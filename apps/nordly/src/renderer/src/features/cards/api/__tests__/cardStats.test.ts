import { expect, it, vi } from 'vitest';
vi.mock('@shared/db/nordlyDb', () => ({ requireUserId: () => 'profile' }));
vi.mock('../../repository/cardReviewsStore', () => ({ readCardsDaily: vi.fn(async (_user: string, day: string) => ({ reviewed: day === '2026-10-25' ? 8 : 2, new: day === '2026-10-25' ? 3 : 1 })) }));
import { getCardStats } from '../cardStats';
import { readCardsDaily } from '../../repository/cardReviewsStore';
it('counts existing daily answers across the seven-day window without scanning notes', async () => {
  expect(await getCardStats('2026-10-25')).toEqual({ todayReviewed: 8, todayNew: 3, weekReviewed: 20 });
  expect(readCardsDaily).toHaveBeenCalledTimes(7);
  expect(readCardsDaily).toHaveBeenCalledWith('profile', '2026-10-19');
});
