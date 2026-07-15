import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useLocale, useT } from '@nordly-i18n';

import {
  allDayEntriesForDay,
  appleToCalendarEntries,
  calendarColumnStyle,
  googleToCalendarEntries,
  layoutTimedEntriesForDay,
  linkedGoogleEventIds,
  inspectCalendarEntry,
  taskIsMeeting,
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

function taskEntryFromPlanned(
  task: TaskCard,
  start: Date,
  end: Date,
): CalendarEntry {
  return {
    id: `task:${task.id}`,
    source: 'task',
    title: task.title || 'Untitled',
    start,
    end,
    allDay: false,
    taskId: task.id,
    taskStatus: task.status,
    epicId: task.epicId,
    epicColor: task.epicColor,
    googleEventId: task.googleEventId,
  };
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
  const { events: googleEvents } = useGoogleCalendarEvents(dayStart, dayEnd, googleEnabled);
  const { events: appleEvents } = useAppleCalendarEvents(
    dayStart,
    dayEnd,
    appleCalendarEnabled,
  );

  const linkedGoogleIds = useMemo(() => linkedGoogleEventIds(tasks), [tasks]);

  const calendarEntries = useMemo(
    () => [
      ...googleToCalendarEntries(googleEvents, linkedGoogleIds, tasks),
      ...appleToCalendarEntries(appleEvents),
    ],
    [googleEvents, appleEvents, linkedGoogleIds, tasks],
  );
  const allDayCalendar = useMemo(
    () => allDayEntriesForDay(calendarEntries, dayKey),
    [calendarEntries, dayKey],
  );
  const planned = useMemo(() => tasksPlannedForDay(dayKey, tasks), [dayKey, tasks]);
  const plannedByTaskId = useMemo(() => {
    const map = new Map<string, (typeof planned)[number]>();
    for (const block of planned) map.set(block.task.id, block);
    return map;
  }, [planned]);

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

  const timedLayout = useMemo(() => {
    const taskEntries = planned.map(({ task, start, end }) =>
      taskEntryFromPlanned(task, start, end),
    );
    const meetingEntries = calendarEntries.filter(
      (e) => !e.allDay && toDayKey(e.start) === dayKey,
    );
    return layoutTimedEntriesForDay([...meetingEntries, ...taskEntries], hourPx);
  }, [calendarEntries, planned, dayKey, hourPx]);

  const hoursHeight = HOUR_COUNT * hourPx;
  const gridHeight = hoursHeight + GRID_PAD_TOP + GRID_PAD_BOTTOM;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
  }, [dayKey]);

  const hasBlocks =
    timedLayout.length > 0 || allDayCalendar.length > 0;

  const openCalendarEntry = (entry: CalendarEntry): void => {
    inspectCalendarEntry(entry);
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
          {allDayCalendar.map((entry) => {
            const canOpen =
              entry.source === 'google' || entry.source === 'apple';
            return (
              <button
                key={entry.id}
                type="button"
                className="nordly-calendar-allday-chip focus-ring"
                data-source={entry.source}
                data-readonly={canOpen ? undefined : 'true'}
                style={{ width: '100%', cursor: canOpen ? 'pointer' : 'default' }}
                title={entry.title}
                onClick={() => openCalendarEntry(entry)}
              >
                {entry.title}
              </button>
            );
          })}
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

          {timedLayout.map(({ entry, top: layoutTop, height: layoutHeight, column, columnCount }) => {
            const colStyle = calendarColumnStyle(column, columnCount);

            if (entry.source === 'task' && entry.taskId) {
              const block = plannedByTaskId.get(entry.taskId);
              if (!block) return null;
              const { task } = block;
              const meetingMode = taskIsMeeting(task);
              const baseTop = GRID_PAD_TOP + layoutTop;
              const baseHeight = layoutHeight;
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

              if (meetingMode) {
                const openMeeting = () =>
                  openCalendarEntry({
                    ...entry,
                    conferenceUrl: task.conferenceUrl,
                    conferenceProvider: task.conferenceProvider,
                  });
                return (
                  <div
                    key={entry.id}
                    className="nordly-calendar-event nordly-timeline-meeting focus-ring"
                    data-source="task"
                    data-meeting="true"
                    data-done={done ? 'true' : undefined}
                    data-epic={epicColor ? 'true' : undefined}
                    data-dragging={isDragging || isResizing ? 'true' : undefined}
                    title={task.title}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openMeeting();
                      }
                    }}
                    style={{
                      top,
                      height,
                      ...colStyle,
                      right: 'auto',
                      zIndex: isDragging || isResizing ? 4 : column + 1,
                      touchAction: 'none',
                      userSelect: 'none',
                      cursor: canDrag ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
                      ...(epicSurface ?? {}),
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
                              onClick: openMeeting,
                            });
                          }
                        : (e) => {
                            e.preventDefault();
                            openMeeting();
                          }
                    }
                  >
                    <span className="nordly-calendar-event__title">{task.title}</span>
                    {canResize ? (
                      <div
                        className="nordly-timeline-task__resize"
                        aria-hidden
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          startResize(e, {
                            id: task.id,
                            baseHeight,
                            min: minHeight,
                            max: maxHeight,
                            onCommit: commitResize,
                          });
                        }}
                      />
                    ) : null}
                  </div>
                );
              }

              return (
                <div
                  key={entry.id}
                  className="nordly-timeline-task"
                  data-done={done ? 'true' : 'false'}
                  data-epic={epicColor ? 'true' : 'false'}
                  data-dragging={isDragging || isResizing ? 'true' : 'false'}
                  title={task.title}
                  style={{
                    position: 'absolute',
                    top,
                    height,
                    ...colStyle,
                    right: 'auto',
                    zIndex: isDragging || isResizing ? 4 : column + 1,
                    touchAction: 'none',
                    userSelect: 'none',
                    ...(epicSurface ?? {}),
                    ...(isDragging && !epicColor
                      ? { boxShadow: '0 8px 24px rgb(0 0 0 / 0.5)' }
                      : {}),
                  }}
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
            }

            const canOpen =
              (entry.source === 'google' && Boolean(entry.googleHtmlLink || entry.googleEventId)) ||
              (entry.source === 'apple' && Boolean(entry.appleEventId));

            return (
              <button
                key={entry.id}
                type="button"
                className="nordly-calendar-event focus-ring"
                data-source={entry.source}
                data-readonly={
                  entry.source === 'google' && entry.googleEditable === false
                    ? 'true'
                    : undefined
                }
                title={entry.title}
                onClick={() => openCalendarEntry(entry)}
                style={{
                  top: GRID_PAD_TOP + layoutTop,
                  height: layoutHeight,
                  ...colStyle,
                  right: 'auto',
                  zIndex: column + 1,
                  cursor: canOpen ? 'pointer' : 'default',
                }}
              >
                <span className="nordly-calendar-event__title">{entry.title}</span>
              </button>
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
