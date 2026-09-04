import { useEffect, useMemo, useState } from 'react';

import type { TFunc } from '@nordly-i18n';

import type { NordlyStats } from '@features/focus/api/focusClient';
import { addDays, parseDayKey, toDayKey } from '@shared/lib/dates';
import { useTodayKey } from '@shared/hooks/useTodayKey';
import { readDailyGoalMin } from '@shared/model/settings';
import { BASELINE_ROW, BIG_NUMBER_STYLE } from './primitives';

const STREAK_GOAL_DAYS = 14;

export interface StatsInsights {
  thisWeekSeconds: number;
  previousWeekSeconds: number;
  weekDeltaPercent: number;
  streakPercent: number;
  todayMinutes: number;
  totalSessions: number;
  averageSessionMinutes: number;
}

export function deriveStatsInsights(
  data: NordlyStats | null,
  todayKey: string,
): StatsInsights {
  const heatmap = data?.heatmap ?? [];
  const lastSeven = data?.lastSevenDays ?? [];
  const thisWeekSeconds = lastSeven.reduce(
    (total, day) => total + day.seconds,
    0,
  );
  const heatmapByDay = new Map(heatmap.map((day) => [day.date, day]));
  const anchor = parseDayKey(todayKey);

  let previousWeekSeconds = 0;
  for (let offset = 7; offset < 14; offset++) {
    previousWeekSeconds +=
      heatmapByDay.get(toDayKey(addDays(anchor, -offset)))?.seconds ?? 0;
  }
  const weekDeltaPercent =
    previousWeekSeconds > 0
      ? Math.round(
          ((thisWeekSeconds - previousWeekSeconds) / previousWeekSeconds) * 100,
        )
      : thisWeekSeconds > 0
        ? 100
        : 0;
  const streakPercent = Math.min(
    100,
    ((data?.currentStreakDays ?? 0) / STREAK_GOAL_DAYS) * 100,
  );
  const todaySeconds =
    heatmapByDay.get(todayKey)?.seconds ??
    lastSeven.find((day) => day.date === todayKey)?.seconds ??
    0;

  let totalSeconds = 0;
  let totalSessions = 0;
  for (const day of heatmap) {
    totalSeconds += day.seconds;
    totalSessions += day.sessions;
  }

  return {
    thisWeekSeconds,
    previousWeekSeconds,
    weekDeltaPercent,
    streakPercent,
    todayMinutes: todaySeconds > 0 ? Math.ceil(todaySeconds / 60) : 0,
    totalSessions,
    averageSessionMinutes:
      totalSessions > 0 ? Math.round(totalSeconds / totalSessions / 60) : 0,
  };
}

export function InsightsGrid({
  data,
  t,
}: {
  data: NordlyStats | null;
  t: TFunc;
}): JSX.Element {
  const todayKey = useTodayKey();
  const dailyGoalMinutes = readDailyGoalMin();
  const insights = useMemo(
    () => deriveStatsInsights(data, todayKey),
    [data, todayKey],
  );
  const goalPercent = Math.min(
    100,
    (insights.todayMinutes / Math.max(1, dailyGoalMinutes)) * 100,
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px 14px',
        marginTop: 2,
      }}
    >
      <StreakRingCell
        streakDays={data?.currentStreakDays ?? 0}
        percent={insights.streakPercent}
        goal={STREAK_GOAL_DAYS}
        t={t}
      />
      <CompareWeekCell
        thisHours={insights.thisWeekSeconds / 3600}
        previousHours={insights.previousWeekSeconds / 3600}
        deltaPercent={insights.weekDeltaPercent}
        t={t}
      />
      <GoalMeterCell
        todayMinutes={insights.todayMinutes}
        goalMinutes={dailyGoalMinutes}
        percent={goalPercent}
        t={t}
      />
      <SimpleStatCell
        value={String(insights.averageSessionMinutes)}
        unit="min"
        label={t('nordly.stats.avg_session')}
        sub={
          insights.totalSessions > 0
            ? t('nordly.stats.sessions_total', {
                n: insights.totalSessions,
              })
            : t('nordly.stats.no_data_yet')
        }
      />
    </div>
  );
}

function StreakRingCell({
  streakDays,
  percent,
  goal,
  t,
}: {
  streakDays: number;
  percent: number;
  goal: number;
  t: TFunc;
}): JSX.Element {
  const size = 56;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setAnimated(true), 60);
    return () => window.clearTimeout(timeout);
  }, []);
  const offset = animated
    ? circumference - (circumference * percent) / 100
    : circumference;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} aria-hidden="true" style={{ flexShrink: 0 }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--ink-tint-08)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--ink-rgb) / 0.95)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition:
              'stroke-dashoffset var(--motion-dur-cinematic) var(--motion-ease-standard)',
          }}
        />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={BIG_NUMBER_STYLE}>{streakDays}</span>
          <span style={{ fontSize: 10, color: 'var(--ink-40)' }}>
            {t('nordly.stats.days_of_goal', { goal })}
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--ink-40)' }}>
          {t('nordly.stats.streak_goal')}
        </div>
      </div>
    </div>
  );
}

function CompareWeekCell({
  thisHours,
  previousHours,
  deltaPercent,
  t,
}: {
  thisHours: number;
  previousHours: number;
  deltaPercent: number;
  t: TFunc;
}): JSX.Element {
  const isUp = deltaPercent >= 0;
  const tone = isUp ? 'var(--ink)' : 'var(--red)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={BASELINE_ROW}>
        <span style={BIG_NUMBER_STYLE}>{thisHours.toFixed(1)}</span>
        <span style={{ fontSize: 10, color: 'var(--ink-40)' }}>
          {t('nordly.stats.hrs')}
        </span>
        <span
          style={{
            marginLeft: 4,
            fontSize: 11,
            fontWeight: 600,
            color: tone,
          }}
        >
          {isUp ? '↑' : '↓'} {Math.abs(deltaPercent)}%
        </span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-40)' }}>
        {t('nordly.stats.vs_last_week', {
          hrs: previousHours.toFixed(1),
        })}
      </div>
    </div>
  );
}

function GoalMeterCell({
  todayMinutes,
  goalMinutes,
  percent,
  t,
}: {
  todayMinutes: number;
  goalMinutes: number;
  percent: number;
  t: TFunc;
}): JSX.Element {
  const tone =
    percent >= 100 ? 'var(--ink)' : 'rgb(var(--ink-rgb) / 0.85)';
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setAnimated(true), 80);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={BASELINE_ROW}>
        <span style={{ ...BIG_NUMBER_STYLE, color: tone }}>{todayMinutes}</span>
        <span style={{ fontSize: 10, color: 'var(--ink-40)' }}>
          {t('nordly.stats.min_today', { goal: goalMinutes })}
        </span>
      </div>
      <div
        aria-hidden="true"
        style={{
          position: 'relative',
          height: 4,
          overflow: 'hidden',
          background: 'var(--ink-tint-06)',
          borderRadius: 2,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${animated ? percent : 0}%`,
            background: tone,
            transition:
              'width var(--motion-dur-cinematic) var(--motion-ease-standard)',
          }}
        />
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-40)' }}>
        {t('nordly.stats.daily_goal')}
      </div>
    </div>
  );
}

function SimpleStatCell({
  value,
  unit,
  label,
  sub,
}: {
  value: string;
  unit?: string;
  label: string;
  sub?: string;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={BASELINE_ROW}>
        <span style={BIG_NUMBER_STYLE}>{value}</span>
        {unit ? (
          <span style={{ fontSize: 10, color: 'var(--ink-40)' }}>{unit}</span>
        ) : null}
      </div>
      <div style={{ fontSize: 10, color: 'var(--ink-40)' }}>{label}</div>
      {sub ? (
        <div
          style={{
            marginTop: 1,
            fontSize: 9,
            color: 'var(--ink-20)',
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}
