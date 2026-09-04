import { describe, expect, it } from 'vitest';

import { padToSevenDays } from '../focusRemote';

describe('padToSevenDays', () => {
  it('ends the window on the requested stats anchor', () => {
    const days = padToSevenDays(
      [
        { date: '2026-01-04', seconds: 60, sessions: 1 },
        { date: '2026-01-10', seconds: 120, sessions: 2 },
      ],
      '2026-01-10',
    );

    expect(days.map((day) => day.date)).toEqual([
      '2026-01-04',
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
    ]);
    expect(days[0]).toEqual({ date: '2026-01-04', seconds: 60, sessions: 1 });
    expect(days[6]).toEqual({ date: '2026-01-10', seconds: 120, sessions: 2 });
  });
});
