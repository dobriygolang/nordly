import { describe, expect, it } from 'vitest';

import type { NordlyStats } from '@features/focus/api/focusClient';
import { deriveStatsInsights } from '../insights';

describe('deriveStatsInsights', () => {
  it('anchors current and previous week calculations to the requested local day', () => {
    const stats: NordlyStats = {
      currentStreakDays: 7,
      longestStreakDays: 10,
      totalFocusedSeconds: 10_800,
      lastSevenDays: [
        { date: '2026-08-27', seconds: 3_600, sessions: 2 },
        { date: '2026-08-26', seconds: 1_800, sessions: 1 },
      ],
      heatmap: [
        { date: '2026-08-27', seconds: 3_600, sessions: 2 },
        { date: '2026-08-26', seconds: 1_800, sessions: 1 },
        { date: '2026-08-20', seconds: 1_800, sessions: 1 },
        { date: '2026-08-19', seconds: 1_800, sessions: 1 },
      ],
    };

    expect(deriveStatsInsights(stats, '2026-08-27')).toEqual({
      thisWeekSeconds: 5_400,
      previousWeekSeconds: 3_600,
      weekDeltaPercent: 50,
      streakPercent: 50,
      todayMinutes: 60,
      totalSessions: 5,
      averageSessionMinutes: 30,
    });
  });
});
