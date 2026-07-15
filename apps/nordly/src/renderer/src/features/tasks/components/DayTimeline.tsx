import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useLocale, useT } from '@nordly-i18n';

import {
  allDayEntriesForDay,
  appleToCalendarEntries,
  googleToCalendarEntries,
  layoutTimedEntriesForDay,
  linkedGoogleEventIds,
  openExternalUrl,
  tasksPlannedForDay,
  useAppleCalendarEvents,
  useGoogleCalendarConnection,
  useGoogleCalendarEvents,
  type CalendarEntry,
} from '@features/calendar/api/calendar';
import type { TaskCard } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import { isCloudEnabled } from '@shared/model/features';
import { readSettings } from '@shared/model/settings';
import { useVerticalDrag } from '@shared/lib/useVerticalDrag';
import { useVerticalResize } from '@shared/lib/useVerticalResize';
import {
  defaultDurationMin,
  formatTimelineHeader,
  formatTimeShort,
  snapMinutes,
  startOfLocalDay,
  toDayKey,
} from '@shared/lib/dates';
import { epicTimelineSurfaceStyle, resolveTaskEpicColor } from '@features/tasks/lib/taskUi';

const HOUR_START = 6;
const HOUR_END = 23;
const HOUR_COUNT = HOUR_END - HOUR_START + 1;
const HOUR_PX_DEFAULT = 52;
const HOUR_PX_MIN = 22;
const GRID_PAD_TOP = 12;
const GRID_PAD_BOTTOM = 24;
const MIN_DURATION_MIN = 15;
const MAX_DURATION_MIN = 480;

interface DayTimelineProps {
  date: Date;
  tasks: TaskCard[];
  epics: TaskEpic[];
  onReschedule?: (task: TaskCard, start: Date) => void;
  onDurationChange?: (task: TaskCard, durationMin: number) => void;
  /** When false, use fixed hour height and scroll (full 06:00–23:00). Default: true (compress to fit). */
  fitToHeight?: boolean;
  className?: string;
}

function hourLabel(h: number, locale: 'en' | 'ru'): string {
  return formatTimeShort(new Date(2000, 0, 1, h, 0), locale);
}

export const DayTimeline = memo(function DayTimeline({
  date,
  tasks,
  epics,
  onReschedule,
  onDurationChange,
  fitToHeight = true,
  className,
}: DayTimelineProps) {
  const t = useT();
  const [locale] = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayKey = toDayKey(date);
  const now = new Date();
  const showNow = toDayKey(now) === dayKey;
  const { dragId, dragTop, start: startDrag } = useVerticalDrag();
  const { resizeId, resizeHeight, start: startResize } = useVerticalResize();

  const dayStart = useMemo(() => startOfLocalDay(date), [date]);
  const dayEnd = useMemo(() => {
    const end = startOfLocalDay(date);
    end.setDate(end.getDate() + 1);
    return end;
  }, [date]);

  const { connected, ready: connectionReady } = useGoogleCalendarConnection();
  const googleEnabled = isCloudEnabled() && connected && connectionReady;
  const appleCalendarEnabled = readSettings().appleCalendarEnabled;
  const {
    events: googleEvents,
  } = useGoogleCalendarEvents(dayStart, dayEnd, googleEnabled);
  const { events: appleEvents } = useAppleCalendarEvents(
    dayStart,
    dayEnd,
    appleCalendarEnabled,
  );

  const linkedGoogleIds = useMemo(() => linkedGoogleEventIds(tasks), [tasks]);

  const calendarEntries = useMemo(
    () => [
      ...googleToCalendarEntries(googleEvents, linkedGoogleIds),
      ...appleToCalendarEntries(appleEvents),
    ],
    [googleEvents, appleEvents, linkedGoogleIds],
  );
  const allDayCalendar = useMemo(
    () => allDayEntriesForDay(calendarEntries, dayKey),
    [calendarEntries, dayKey],
  );
  const planned = useMemo(() => tasksPlannedForDay(dayKey, tasks), [dayKey, tasks]);

  // Fit all hours into the available height (task board), or fixed slot height with scroll (planning).
  const [hourPx, setHourPx] = useState(HOUR_PX_DEFAULT);
  useLayoutEffect(() => {
    if (!fitToHeight) {
      setHourPx(HOUR_PX_DEFAULT);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    const recompute = () => {
      const usable = el.clientHeight - GRID_PAD_TOP - GRID_PAD_BOTTOM;
      if (usable <= 0) return;
      setHourPx(Math.max(HOUR_PX_MIN, Math.floor(usable / HOUR_COUNT)));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitToHeight]);

  const timedCalendarLayout = useMemo(
    () =>
      layoutTimedEntriesForDay(
        calendarEntries.filter((e) => !e.allDay && toDayKey(e.start) === dayKey),
        hourPx,
      ),
    [calendarEntries, dayKey, hourPx],
  );

  const hoursHeight = HOUR_COUNT * hourPx;
  const gridHeight = hoursHeight + GRID_PAD_TOP + GRID_PAD_BOTTOM;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [dayKey]);

  const hasBlocks =
    planned.length > 0 || timedCalendarLayout.length > 0 || allDayCalendar.length > 0;

  const openCalendarEntry = (entry: CalendarEntry): void => {
    if (entry.source === 'google' && entry.googleHtmlLink) {
      openExternalUrl(entry.googleHtmlLink);
    }
  };

  return (
    <aside
      className={className ? `nordly-day-timeline ${className}` : 'nordly-day-timeline'}
      style={{
        flex: '0 0 280px',
        borderLeft: '1px solid var(--ink-tint-06)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <header className="nordly-day-timeline__header">
        {formatTimelineHeader(date, locale)}
      </header>

      {allDayCalendar.length > 0 && (
        <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {allDayCalendar.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="nordly-calendar-allday-chip focus-ring"
              data-source={entry.source}
              data-readonly={entry.source !== 'google' ? 'true' : undefined}
              style={{ width: '100%' }}
              title={entry.title}
              onClick={() => openCalendarEntry(entry)}
            >
              {entry.title}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="nordly-day-timeline__scroll nordly-hide-scrollbar"
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          paddingRight: 8,
          overscrollBehavior: 'contain',
        }}
      >
        <div
          style={{
            position: 'relative',
            height: gridHeight,
            marginLeft: 44,
          }}
        >
          {Array.from({ length: HOUR_COUNT }, (_, i) => HOUR_START + i).map((h) => (
            <div
              key={h}
              className="nordly-day-timeline__hour"
              style={{
                position: 'absolute',
                top: GRID_PAD_TOP + (h - HOUR_START) * hourPx,
                left: 0,
                right: 0,
                height: hourPx,
                borderTop: '1px solid var(--ink-tint-06)',
              }}
            >
              <span
                className="mono"
                style={{
                  position: 'absolute',
                  left: -44,
                  top: -7,
                  width: 40,
                  textAlign: 'right',
                  fontSize: 10,
                  color: 'var(--ink-40)',
                }}
              >
                {hourLabel(h, locale)}
              </span>
            </div>
          ))}

          {showNow && now.getHours() >= HOUR_START && now.getHours() <= HOUR_END && (
            <div
              style={{
                position: 'absolute',
                top:
                  GRID_PAD_TOP +
                  (now.getHours() - HOUR_START) * hourPx +
                  (now.getMinutes() / 60) * hourPx,
                left: -6,
                right: 0,
                height: 2,
                background: '#e85d4c',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: -4,
                  top: -4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#e85d4c',
                }}
              />
            </div>
          )}

          {timedCalendarLayout.map(({ entry, top, height, column, columnCount }) => (
            <button
              key={entry.id}
              type="button"
              className="nordly-calendar-event focus-ring"
              data-source={entry.source}
              data-readonly={
                entry.source === 'google'
                  ? entry.googleEditable === false
                    ? 'true'
                    : undefined
                  : 'true'
              }
              title={entry.title}
              onClick={() => openCalendarEntry(entry)}
              style={{
                top: GRID_PAD_TOP + top,
                height,
                '--cal-col': column,
                '--cal-cols': columnCount,
                zIndex: column + 1,
                cursor: entry.source === 'google' && entry.googleHtmlLink ? 'pointer' : 'default',
              } as React.CSSProperties}
            >
              <span className="nordly-calendar-event__title">{entry.title}</span>
            </button>
          ))}

          {planned.map(({ task, start }) => {
            const startMin = start.getHours() * 60 + start.getMinutes();
            const durationMin = defaultDurationMin(task);
            const baseTop = GRID_PAD_TOP + (startMin / 60 - HOUR_START) * hourPx;
            const baseHeight = Math.max(28, (durationMin / 60) * hourPx);
            const minTop = GRID_PAD_TOP;
            const maxTop = GRID_PAD_TOP + HOUR_COUNT * hourPx - baseHeight;
            const gridBottom = GRID_PAD_TOP + HOUR_COUNT * hourPx;
            const isDragging = dragId === task.id;
            const isResizing = resizeId === task.id;
            const top = Math.max(minTop, Math.min(isDragging ? dragTop : baseTop, maxTop));
            const height = isResizing ? resizeHeight : baseHeight;
            const minHeight = Math.max(28, (MIN_DURATION_MIN / 60) * hourPx);
            const maxHeight = Math.max(minHeight, gridBottom - top);
            const done = task.status === 'done';
            const canDrag = Boolean(onReschedule);
            const canResize = Boolean(onDurationChange);
            const epicColor = resolveTaskEpicColor(task, epics);
            const epicSurface = epicColor
              ? epicTimelineSurfaceStyle(epicColor, { done, dragging: isDragging || isResizing })
              : null;

            const commitMove = (finalTop: number) => {
              const min = snapMinutes(((finalTop - GRID_PAD_TOP) / hourPx + HOUR_START) * 60);
              const next = startOfLocalDay(date);
              next.setHours(Math.floor(min / 60), min % 60, 0, 0);
              onReschedule?.(task, next);
            };

            const commitResize = (finalHeight: number) => {
              const snapped = snapMinutes((finalHeight / hourPx) * 60, 15);
              const nextDuration = Math.max(
                MIN_DURATION_MIN,
                Math.min(MAX_DURATION_MIN, snapped),
              );
              onDurationChange?.(task, nextDuration);
            };

            return (
              <div
                key={task.id}
                className="nordly-timeline-task"
                data-done={done ? 'true' : 'false'}
                data-epic={epicColor ? 'true' : 'false'}
                data-dragging={isDragging || isResizing ? 'true' : 'false'}
                title={task.title}
                style={{
                  position: 'absolute',
                  top,
                  left: 4,
                  right: 4,
                  height,
                  zIndex: isDragging || isResizing ? 4 : 2,
                  touchAction: 'none',
                  userSelect: 'none',
                  ...(epicSurface ?? {}),
                  ...(isDragging && !epicColor
                    ? { boxShadow: '0 8px 24px rgb(0 0 0 / 0.5)' }
                    : {}),
                } as React.CSSProperties}
              >
                <div
                  className="nordly-timeline-task__body"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden',
                    cursor: canDrag ? (isDragging ? 'grabbing' : 'grab') : 'default',
                  }}
                  onPointerDown={
                    canDrag
                      ? (e) => {
                          startDrag(e, {
                            id: task.id,
                            baseTop,
                            min: minTop,
                            max: maxTop,
                            onCommit: commitMove,
                          });
                        }
                      : undefined
                  }
                >
                  {task.title}
                </div>
                {canResize && (
                  <div
                    className="nordly-timeline-task__resize"
                    aria-hidden
                    onPointerDown={(e) => {
                      startResize(e, {
                        id: task.id,
                        baseHeight,
                        min: minHeight,
                        max: maxHeight,
                        onCommit: commitResize,
                      });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {!hasBlocks && (
          <p style={{ fontSize: 11, color: 'var(--ink-40)', padding: '8px 8px 24px' }}>
            {t('nordly.taskboard.timeline_empty')}
          </p>
        )}
      </div>
    </aside>
  );
});
