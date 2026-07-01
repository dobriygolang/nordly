import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useLocale, useT } from '@nordly-i18n';

import { openExternalUrl } from '@features/calendar/api/calendarClient';
import {
  allDayEntriesForDay,
  googleToCalendarEntries,
  layoutTimedEntriesForDay,
  tasksPlannedForDay,
} from '@features/calendar/lib/events';
import { useGoogleCalendarConnection } from '@features/calendar/lib/useGoogleCalendarConnection';
import { useGoogleCalendarEvents } from '@features/calendar/lib/useGoogleCalendarEvents';
import type { TaskCard } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import { LOCAL_ONLY } from '@app/config/features';
import { useVerticalDrag } from '@shared/lib/useVerticalDrag';
import {
  defaultDurationMin,
  formatTimelineHeader,
  formatTimeShort,
  snapMinutes,
  startOfLocalDay,
  toDayKey,
} from './lib/dates';
import { epicTimelineSurfaceStyle, resolveTaskEpicColor } from './lib/taskUi';

const HOUR_START = 6;
const HOUR_END = 23;
const HOUR_COUNT = HOUR_END - HOUR_START + 1;
const HOUR_PX_DEFAULT = 52;
const HOUR_PX_MIN = 22;
const GRID_PAD_TOP = 12;
const GRID_PAD_BOTTOM = 24;

interface DayTimelineProps {
  date: Date;
  tasks: TaskCard[];
  epics: TaskEpic[];
  onReschedule?: (task: TaskCard, start: Date) => void;
}

function hourLabel(h: number, locale: 'en' | 'ru'): string {
  return formatTimeShort(new Date(2000, 0, 1, h, 0), locale);
}

export function DayTimeline({ date, tasks, epics, onReschedule }: DayTimelineProps) {
  const t = useT();
  const [locale] = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayKey = toDayKey(date);
  const now = new Date();
  const showNow = toDayKey(now) === dayKey;
  const { dragId, dragTop, start: startDrag } = useVerticalDrag();

  const dayStart = useMemo(() => startOfLocalDay(date), [date]);
  const dayEnd = useMemo(() => {
    const end = startOfLocalDay(date);
    end.setDate(end.getDate() + 1);
    return end;
  }, [date]);

  const { connected, ready: connectionReady } = useGoogleCalendarConnection();
  const googleEnabled = !LOCAL_ONLY && connected && connectionReady;
  const {
    events: googleEvents,
  } = useGoogleCalendarEvents(dayStart, dayEnd, googleEnabled);

  const linkedGoogleIds = useMemo(
    () =>
      new Set(
        tasks.map((task) => task.googleEventId).filter((id): id is string => Boolean(id)),
      ),
    [tasks],
  );

  const googleEntries = useMemo(
    () => googleToCalendarEntries(googleEvents, linkedGoogleIds),
    [googleEvents, linkedGoogleIds],
  );
  const allDayGoogle = useMemo(
    () => allDayEntriesForDay(googleEntries, dayKey),
    [googleEntries, dayKey],
  );
  const planned = useMemo(() => tasksPlannedForDay(dayKey, tasks), [dayKey, tasks]);

  // Fit all hours into the available height
  const [hourPx, setHourPx] = useState(HOUR_PX_DEFAULT);
  useLayoutEffect(() => {
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
  }, []);

  const timedGoogleLayout = useMemo(
    () =>
      layoutTimedEntriesForDay(
        googleEntries.filter((e) => !e.allDay && toDayKey(e.start) === dayKey),
        hourPx,
      ),
    [googleEntries, dayKey, hourPx],
  );

  const hoursHeight = HOUR_COUNT * hourPx;
  const gridHeight = hoursHeight + GRID_PAD_TOP + GRID_PAD_BOTTOM;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [dayKey]);

  const hasBlocks = planned.length > 0 || timedGoogleLayout.length > 0 || allDayGoogle.length > 0;

  return (
    <aside
      style={{
        flex: '0 0 280px',
        borderLeft: '1px solid var(--ink-tint-06)',
        padding: '0 0 0 16px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <header style={{ padding: '0 8px 12px', fontSize: 13, fontWeight: 600, color: 'var(--ink-80)' }}>
        {formatTimelineHeader(date, locale)}
      </header>

      {allDayGoogle.length > 0 && (
        <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {allDayGoogle.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="nordly-calendar-allday-chip focus-ring"
              data-source="google"
              style={{ width: '100%' }}
              title={entry.title}
              onClick={() => entry.googleHtmlLink && openExternalUrl(entry.googleHtmlLink)}
            >
              {entry.title}
            </button>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
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

          {timedGoogleLayout.map(({ entry, top, height, column, columnCount }) => (
            <button
              key={entry.id}
              type="button"
              className="nordly-calendar-event focus-ring"
              data-source="google"
              data-readonly={entry.googleEditable === false ? 'true' : undefined}
              title={entry.title}
              onClick={() => entry.googleHtmlLink && openExternalUrl(entry.googleHtmlLink)}
              style={{
                top: GRID_PAD_TOP + top,
                height,
                '--cal-col': column,
                '--cal-cols': columnCount,
                zIndex: column + 1,
                cursor: entry.googleHtmlLink ? 'pointer' : 'default',
              } as React.CSSProperties}
            >
              <span className="nordly-calendar-event__title">{entry.title}</span>
            </button>
          ))}

          {planned.map(({ task, start }) => {
            const startMin = start.getHours() * 60 + start.getMinutes();
            const baseTop = GRID_PAD_TOP + (startMin / 60 - HOUR_START) * hourPx;
            const height = Math.max(28, (defaultDurationMin(task) / 60) * hourPx);
            const minTop = GRID_PAD_TOP;
            const maxTop = GRID_PAD_TOP + HOUR_COUNT * hourPx - height;
            const isDragging = dragId === task.id;
            const top = Math.max(minTop, Math.min(isDragging ? dragTop : baseTop, maxTop));
            const done = task.status === 'done';
            const canDrag = Boolean(onReschedule);
            const epicColor = resolveTaskEpicColor(task, epics);
            const epicSurface = epicColor
              ? epicTimelineSurfaceStyle(epicColor, { done, dragging: isDragging })
              : null;

            const commit = (finalTop: number) => {
              const min = snapMinutes(((finalTop - GRID_PAD_TOP) / hourPx + HOUR_START) * 60);
              const next = startOfLocalDay(date);
              next.setHours(Math.floor(min / 60), min % 60, 0, 0);
              onReschedule?.(task, next);
            };

            return (
              <div
                key={task.id}
                className="nordly-timeline-task"
                data-done={done ? 'true' : 'false'}
                data-epic={epicColor ? 'true' : 'false'}
                title={task.title}
                onPointerDown={
                  canDrag
                    ? (e) => {
                        e.stopPropagation();
                        startDrag(e, {
                          id: task.id,
                          baseTop,
                          min: minTop,
                          max: maxTop,
                          onCommit: commit,
                        });
                      }
                    : undefined
                }
                style={{
                  position: 'absolute',
                  top,
                  left: 4,
                  right: 4,
                  height,
                  zIndex: isDragging ? 4 : 2,
                  cursor: canDrag ? (isDragging ? 'grabbing' : 'grab') : 'default',
                  touchAction: 'none',
                  userSelect: 'none',
                  ...(epicSurface ?? {}),
                  ...(isDragging && !epicColor
                    ? { boxShadow: '0 8px 24px rgb(0 0 0 / 0.5)' }
                    : {}),
                } as React.CSSProperties}
              >
                {task.title}
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
}
