import { describe, expect, it } from 'vitest';

import { sameDailyPlan } from '../../api/dailyPlan';

describe('sameDailyPlan', () => {
  it('returns true for matching obstacles, finalize, and snapshot', () => {
    const plan = {
      obstacles: 'x',
      finalizedAt: '2026-07-29T10:00:00.000Z',
      snapshot: { taskIds: ['a', 'b'], activeCount: 1, totalDurationMin: 30 },
    };
    expect(sameDailyPlan(plan, { ...plan, snapshot: { ...plan.snapshot, taskIds: ['a', 'b'] } })).toBe(
      true,
    );
  });

  it('returns false when snapshot task ids change', () => {
    const a = { snapshot: { taskIds: ['a'], activeCount: 1, totalDurationMin: 10 } };
    const b = { snapshot: { taskIds: ['b'], activeCount: 1, totalDurationMin: 10 } };
    expect(sameDailyPlan(a, b)).toBe(false);
  });
});
