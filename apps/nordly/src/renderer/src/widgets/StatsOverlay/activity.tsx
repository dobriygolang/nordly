import { useEffect, useId, useMemo, useState } from 'react';

import type { FocusDay } from '@features/focus/api/focusClient';
import {
  addDays,
  formatWeekdayShort,
  parseDayKey,
  toDayKey,
} from '@shared/lib/dates';
import { useTodayKey } from '@shared/hooks/useTodayKey';

const HEATMAP_CELLS = 7 * 16;
const FULL_DAY_SECONDS = 24 * 60 * 60;
const BAR_MAX_HEIGHT = 90;
const BAR_MIN_HEIGHT = 10;

export function ReferenceHeatmap({ days }: { days: FocusDay[] }): JSX.Element {
  const todayKey = useTodayKey();
  const cells = useMemo(() => {
    const bySeconds = new Map(days.map((day) => [day.date, day.seconds]));
    const todayDate = parseDayKey(todayKey);
    const values: { iso: string; seconds: number; isToday: boolean }[] = [];
    for (let index = HEATMAP_CELLS - 1; index >= 0; index--) {
      const iso = toDayKey(addDays(todayDate, -index));
      values.push({
        iso,
        seconds: bySeconds.get(iso) ?? 0,
        isToday: iso === todayKey,
      });
    }
    return values;
  }, [days, todayKey]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: 'repeat(7, 1fr)',
        gridAutoFlow: 'column',
        gridAutoColumns: '1fr',
        gap: 3,
      }}
    >
      {cells.map((cell) => (
        <span
          key={cell.iso}
          title={`${cell.iso} · ${Math.round(cell.seconds / 60)}m`}
          style={{
            aspectRatio: '1/1',
            borderRadius: 2,
            background:
              cell.seconds > 0
                ? `rgb(var(--ink-rgb) / ${
                    cell.isToday ? 0.95 : heatmapOpacity(cell.seconds)
                  })`
                : 'rgb(var(--ink-rgb) / 0.04)',
            boxShadow: cell.isToday
              ? 'inset 0 0 0 1px rgb(var(--ink-rgb) / 0.35)'
              : undefined,
          }}
        />
      ))}
    </div>
  );
}

function heatmapOpacity(seconds: number): number {
  if (seconds <= 0) return 0.04;
  if (seconds < 600) return 0.12;
  if (seconds < 1800) return 0.22;
  if (seconds < 3600) return 0.36;
  if (seconds < 7200) return 0.52;
  return 0.78;
}

export function StreakCurve({ points }: { points: number[] }): JSX.Element {
  const [animated, setAnimated] = useState(false);
  const gradientId = useId();
  useEffect(() => {
    const timeout = window.setTimeout(() => setAnimated(true), 50);
    return () => window.clearTimeout(timeout);
  }, []);

  const width = 120;
  const height = 42;
  if (points.length < 2) {
    return <svg width={width} height={height} style={{ display: 'block' }} />;
  }

  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = Math.max(1, max - min);
  const coordinates = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((point - min) / span) * (height - 6) - 3;
    return [x, y] as const;
  });
  let path = `M${coordinates[0]![0].toFixed(1)} ${coordinates[0]![1].toFixed(1)}`;
  for (let index = 0; index < coordinates.length - 1; index++) {
    const p0 = coordinates[Math.max(0, index - 1)]!;
    const p1 = coordinates[index]!;
    const p2 = coordinates[index + 1]!;
    const p3 = coordinates[Math.min(coordinates.length - 1, index + 2)]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    path += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }

  const dashLength = width * 3;
  const areaPath = `${path} L${width} ${height} L0 ${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      aria-hidden="true"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--ink-rgb) / 0.45)" />
          <stop offset="100%" stopColor="rgb(var(--ink-rgb) / 0)" />
        </linearGradient>
      </defs>
      <path
        d={areaPath}
        fill={`url(#${gradientId})`}
        opacity={animated ? 1 : 0}
        style={{
          transition:
            'opacity var(--motion-dur-cinematic) var(--motion-ease-standard) 200ms',
        }}
      />
      <path
        d={path}
        fill="none"
        stroke="rgb(var(--ink-rgb) / 0.95)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeDasharray={dashLength}
        strokeDashoffset={animated ? 0 : dashLength}
        style={{
          transition:
            'stroke-dashoffset var(--motion-dur-cinematic) var(--motion-ease-standard)',
        }}
      />
    </svg>
  );
}

export function ReferenceBars({
  days,
  locale,
}: {
  days: FocusDay[];
  locale: 'en' | 'ru';
}): JSX.Element {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setAnimated(true), 30);
    return () => window.clearTimeout(timeout);
  }, []);

  const todayKey = useTodayKey();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${days.length || 7}, 1fr)`,
        gap: 8,
        alignItems: 'end',
        height: BAR_MAX_HEIGHT + 44,
      }}
    >
      {days.map((day, index) => {
        const ratio = day.seconds / FULL_DAY_SECONDS;
        const targetHeight =
          day.seconds > 0
            ? BAR_MIN_HEIGHT + ratio * (BAR_MAX_HEIGHT - BAR_MIN_HEIGHT)
            : 0;
        const isToday = day.date === todayKey;
        return (
          <div
            key={day.date}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              style={{
                width: '100%',
                height: BAR_MAX_HEIGHT,
                display: 'flex',
                alignItems: 'flex-end',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: animated ? targetHeight : 0,
                  background:
                    day.seconds > 0
                      ? isToday
                        ? 'rgb(var(--ink-rgb) / 0.95)'
                        : 'var(--ink-tint-16)'
                      : 'transparent',
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  transition: `height var(--motion-dur-xxlarge) var(--motion-ease-standard) ${index * 60}ms`,
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 600,
                  color: isToday ? 'var(--ink)' : 'var(--ink-60)',
                }}
              >
                {formatWeekdayShort(day.date, locale)}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--ink-40)' }}>
                {parseDayKey(day.date).getDate()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
