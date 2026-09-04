import { describe, expect, it } from 'vitest';

import { currentStreakFromDays } from './focusClient';

describe('currentStreakFromDays', () => {
  it('keeps a streak alive through the day after its latest activity', () => {
    const activeDays = new Set(['2026-08-24', '2026-08-25', '2026-08-26']);

    expect(currentStreakFromDays(activeDays, '2026-08-27')).toBe(3);
  });

  it('uses activity on the anchor day when present', () => {
    const activeDays = new Set(['2026-08-25', '2026-08-26', '2026-08-27']);

    expect(currentStreakFromDays(activeDays, '2026-08-27')).toBe(3);
  });

  it('returns zero after a full inactive day', () => {
    const activeDays = new Set(['2026-08-24', '2026-08-25']);

    expect(currentStreakFromDays(activeDays, '2026-08-27')).toBe(0);
  });
});
