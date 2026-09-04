import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useT, type Locale } from '@nordly-i18n';

import { useCalendarEntryDrag } from '@features/calendar/hooks/useCalendarEntryDrag';
import { calendarEpicSurface } from '@features/calendar/lib/calendarEntrySurface';
import {
  allDayEntriesForDay,
  buildWeekDays,
  calendarColumnStyle,
  calendarHourLabels,
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  CALENDAR_HOUR_HEIGHT_PX,
  CALENDAR_TIME_SNAP_MIN,
  dateFromGridMinutes,
  entriesForWeek,
  formatDayHeader,
  formatHourLabel,
  gridMinutesFromDate,
  layoutTimedEntriesForDay,
  timedEntriesForDay,
  type CalendarEntry,
} from '@features/calendar/lib/events';
import { useCalendarRangeSelect } from '@features/calendar/lib/useCalendarRangeSelect';
import { CalendarEntrySource } from '@features/calendar/model/entry';
import type { TaskEpic } from '@features/tasks/api/epics';
import { useTaskEpics } from '@features/tasks/hooks/useTaskEpics';
import { isTaskDone } from '@features/tasks/model/status';
import { useNowTick } from '@shared/hooks/useNowTick';
import { addDays, parseDayKey, snapMinutes, toDayKey } from '@shared/lib/dates';
import { useVerticalDrag } from '@shared/lib/useVerticalDrag';

const WEEK_GRID_RESERVE_PX = 10;
const ALL_DAY_CHIP_HEIGHT_PX = 22;
const ALL_DAY_CHIP_GAP_PX = 3;
const NOW_LINE_TICK_MS = 30_000;

function CalendarNowLine({ dayKey, hourHeight }: { dayKey: string; hourHeight: number }): JSX.Element | null {
  const now = useNowTick(NOW_LINE_TICK_MS);

  const minutes = gridMinutesFromDate(dayKey, now);
  if (
    minutes == null ||
    minutes < CALENDAR_GRID_START_HOUR * 60 ||
    minutes >= CALENDAR_GRID_END_HOUR * 60
  ) {
    return null;
  }
  const top = (minutes / 60 - CALENDAR_GRID_START_HOUR) * hourHeight;
  return <div className="nordly-calendar-now-line" style={{ top }} aria-hidden />;
}

interface CalendarWeekViewProps {
  weekStart: Date;
  entries: CalendarEntry[];
  todayKey: string;
  locale: Locale;
  onEntryClick: (entry: CalendarEntry) => void;
  onCreateRange: (start: Date, end: Date) => void;
  onError: (error: unknown) => void;
  onGoogleError: (error: unknown) => void;
}

export function CalendarWeekView({
  weekStart,
  entries,
  todayKey,
  locale,
  onEntryClick,
  onCreateRange,
  onError,
  onGoogleError,
}: CalendarWeekViewProps): JSX.Element {
  const t = useT();
  const { epics } = useTaskEpics();
  const yesterdayKey = useMemo(() => toDayKey(addDays(parseDayKey(todayKey), -1)), [todayKey]);
  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const weekEntries = useMemo(() => entriesForWeek(entries, weekStart), [entries, weekStart]);
  const weekAllDayByDay = useMemo(
    () => weekDays.map(({ dayKey }) => allDayEntriesForDay(weekEntries, dayKey)),
    [weekDays, weekEntries],
  );
  const weekAllDayMax = useMemo(
    () => weekAllDayByDay.reduce((max, day) => Math.max(max, day.length), 0),
    [weekAllDayByDay],
  );
  const hours = useMemo(() => calendarHourLabels(), []);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const gridSpan = CALENDAR_GRID_END_HOUR - CALENDAR_GRID_START_HOUR;
  const [hourHeight, setHourHeight] = useState(CALENDAR_HOUR_HEIGHT_PX);

  useLayoutEffect(() => {
    const el = weekScrollRef.current;
    if (!el) return;
    const recompute = () => {
      const slot = el.clientHeight - WEEK_GRID_RESERVE_PX;
      if (slot <= 0) return;
      setHourHeight(Math.max(1, Math.floor(slot / gridSpan)));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridSpan]);

  const gridHeight = gridSpan * hourHeight;

  const weekTimedLayouts = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutTimedEntriesForDay>>();
    for (const { dayKey } of weekDays) {
      map.set(
        dayKey,
        layoutTimedEntriesForDay(
          timedEntriesForDay(weekEntries, dayKey),
          hourHeight,
          CALENDAR_GRID_START_HOUR,
          CALENDAR_GRID_END_HOUR,
          dayKey,
        ),
      );
    }
    return map;
  }, [weekDays, weekEntries, hourHeight]);

  const { dragId, dragTop, start: startDrag } = useVerticalDrag();
  const commitDrag = useCalendarEntryDrag(hourHeight, onError, onGoogleError);
  const { selection: rangeSelection, onColumnPointerDown } = useCalendarRangeSelect({
    hourHeight,
    gridHeight,
    onCommit: ({ start, end }) => onCreateRange(start, end),
  });

  const createTaskFromWeekSlot = useCallback(
    (dayKey: string, offsetTop: number) => {
      const startH = offsetTop / hourHeight + CALENDAR_GRID_START_HOUR;
      const min = snapMinutes(startH * 60, CALENDAR_TIME_SNAP_MIN);
      const start = dateFromGridMinutes(dayKey, min);
      onCreateRange(start, new Date(start.getTime() + CALENDAR_TIME_SNAP_MIN * 60_000));
    },
    [hourHeight, onCreateRange],
  );

  return (
    <div className="nordly-calendar-week">
      <div className="nordly-calendar-week__head">
        <div className="nordly-calendar-week__gutter" aria-hidden />
        {weekDays.map(({ date, dayKey }) => (
          <div
            key={dayKey}
            className="nordly-calendar-week__dayhead"
            data-today={dayKey === todayKey ? 'true' : undefined}
          >
            {formatDayHeader(date, locale)}
          </div>
        ))}
      </div>

      {weekAllDayMax > 0 && (
        <div className="nordly-calendar-week__allday">
          <div className="nordly-calendar-week__allday-label mono">{t('nordly.calendar.all_day')}</div>
          <div
            className="nordly-calendar-week__allday-grid"
            style={{
              minHeight:
                weekAllDayMax * ALL_DAY_CHIP_HEIGHT_PX +
                Math.max(0, weekAllDayMax - 1) * ALL_DAY_CHIP_GAP_PX,
            }}
          >
            {weekDays.map(({ dayKey }, i) => (
              <div key={dayKey} className="nordly-calendar-week__allday-col">
                {weekAllDayByDay[i].map((entry) => (
                  <AllDayEventChip
                    key={entry.id}
                    entry={entry}
                    epics={epics}
                    onActivate={() => onEntryClick(entry)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={weekScrollRef} className="nordly-calendar-week__scroll">
        <div className="nordly-calendar-week__body" style={{ height: gridHeight }}>
          <div className="nordly-calendar-week__times" style={{ height: gridHeight }}>
            {hours.map((hour) => (
              <span key={hour} className="nordly-calendar-week__time" style={{ height: hourHeight }}>
                {formatHourLabel(hour, locale)}
              </span>
            ))}
          </div>

          <div className="nordly-calendar-week__grid" style={{ height: gridHeight }}>
            {weekDays.map(({ dayKey }) => (
              <div
                key={dayKey}
                className="nordly-calendar-week__col"
                onPointerDown={(e) => onColumnPointerDown(dayKey, e)}
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  createTaskFromWeekSlot(dayKey, e.clientY - rect.top);
                }}
              >
                {hours.map((hour) => (
                  <div key={hour} className="nordly-calendar-week__cell" style={{ height: hourHeight }} />
                ))}
                {rangeSelection?.dayKey === dayKey && (
                  <div
                    className="nordly-calendar-selection"
                    style={{ top: rangeSelection.top, height: rangeSelection.height }}
                    aria-hidden
                  />
                )}
                {(dayKey === todayKey || dayKey === yesterdayKey) && (
                  <CalendarNowLine dayKey={dayKey} hourHeight={hourHeight} />
                )}
                {weekTimedLayouts.get(dayKey)?.map(({ entry, top: layoutTop, height, column, columnCount }) => {
                  const maxTop = Math.max(0, gridHeight - height);
                  const isDragging = dragId === entry.id;
                  const top = Math.max(0, Math.min(isDragging ? dragTop : layoutTop, maxTop));
                  const draggable =
                    (entry.source === CalendarEntrySource.Task && Boolean(entry.taskId)) ||
                    (entry.source === CalendarEntrySource.Google &&
                      Boolean(entry.googleEditable) &&
                      !entry.allDay);
                  return (
                    <CalendarEventBlock
                      key={entry.id}
                      entry={entry}
                      epics={epics}
                      top={top}
                      height={height}
                      column={column}
                      columnCount={columnCount}
                      dragging={isDragging}
                      onPointerDown={
                        draggable
                          ? (e) =>
                              startDrag(e, {
                                id: entry.id,
                                baseTop: layoutTop,
                                min: 0,
                                max: maxTop,
                                onCommit: (ft) => void commitDrag(entry, ft, dayKey),
                                onClick: () => onEntryClick(entry),
                              })
                          : undefined
                      }
                      onActivate={() => onEntryClick(entry)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AllDayEventChip({
  entry,
  epics,
  onActivate,
}: {
  entry: CalendarEntry;
  epics: TaskEpic[];
  onActivate: () => void;
}): JSX.Element {
  const canOpen =
    entry.source === CalendarEntrySource.Task ||
    (entry.source === CalendarEntrySource.Google &&
      Boolean(entry.googleHtmlLink || entry.googleEventId)) ||
    (entry.source === CalendarEntrySource.Apple && Boolean(entry.appleEventId));
  const epicSurface = calendarEpicSurface(entry, epics);
  return (
    <button
      type="button"
      className="nordly-calendar-allday-chip focus-ring"
      data-source={entry.source}
      data-epic={epicSurface ? 'true' : undefined}
      data-readonly={canOpen ? undefined : 'true'}
      style={epicSurface ?? undefined}
      onClick={onActivate}
      title={entry.title}
    >
      {entry.title}
    </button>
  );
}

function CalendarEventBlock({
  entry,
  epics,
  top,
  height,
  column,
  columnCount,
  dragging,
  onPointerDown,
  onActivate,
}: {
  entry: CalendarEntry;
  epics: TaskEpic[];
  top: number;
  height: number;
  column: number;
  columnCount: number;
  dragging?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onActivate: () => void;
}): JSX.Element {
  const done = entry.taskStatus ? isTaskDone(entry.taskStatus) : false;
  const isGoogle = entry.source === CalendarEntrySource.Google;
  const isApple = entry.source === CalendarEntrySource.Apple;
  const interactive = Boolean(onPointerDown) || isGoogle || isApple || Boolean(entry.taskId);
  const epicSurface = calendarEpicSurface(entry, epics, { dragging });
  const style = {
    top,
    height,
    ...calendarColumnStyle(column, columnCount),
    right: 'auto',
    zIndex: dragging ? 5 : column + 1,
    ...(epicSurface ?? {}),
    boxShadow: epicSurface?.boxShadow ?? (dragging ? '0 10px 28px rgb(0 0 0 / 0.5)' : undefined),
    cursor: onPointerDown ? (dragging ? 'grabbing' : 'grab') : interactive ? 'pointer' : undefined,
    touchAction: onPointerDown ? 'none' : undefined,
    userSelect: 'none',
  } as React.CSSProperties;

  return (
    <button
      type="button"
      className="nordly-calendar-event focus-ring"
      data-source={entry.source}
      data-done={done ? 'true' : undefined}
      data-epic={epicSurface ? 'true' : undefined}
      data-readonly={
        entry.source === CalendarEntrySource.Google && entry.googleEditable === false
          ? 'true'
          : undefined
      }
      style={style}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown?.(e);
      }}
      onClick={onPointerDown ? undefined : onActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate();
        }
      }}
      title={entry.title}
    >
      <span className="nordly-calendar-event__title">{entry.title}</span>
    </button>
  );
}
