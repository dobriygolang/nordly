import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useT, useLocale } from '@nordly-i18n';

import {
  getGoogleCalendarAuthURL,
  openExternalUrl,
  GoogleReauthError,
  buildWeekDays,
  calendarHourLabels,
  allDayEntriesForDay,
  entriesForWeek,
  entriesForYear,
  formatDayHeader,
  formatHourLabel,
  formatWeekHeaderMonth,
  layoutTimedEntriesForDay,
  startOfWeekMonday,
  timedEntriesForDay,
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  CALENDAR_HOUR_HEIGHT_PX,
  type CalendarEntry,
} from '@features/calendar/api/calendar';
import { SegmentedControl } from '@shared/ui/primitives/SegmentedControl';
import { snapMinutes, toDayKey } from '@shared/lib/dates';
import { useTaskEpics } from '@features/tasks/lib/useTaskEpics';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { formatLocaleDate, formatTimeZoneLabel, getUserTimeZone } from '@shared/lib/localeFormat';
import { useVerticalDrag } from '@shared/lib/useVerticalDrag';
import { useCalendarRangeSelect } from '@features/calendar/api/calendar';
import { refreshGoogleCalendarCache } from '@features/calendar/api/calendar';
import { zIndex } from '@shared/lib/z-index';
import { Icon } from '@shared/ui/primitives/Icon';
import { isCloudEnabled } from '@shared/model/features';
import { CalendarEventEditor } from './CalendarEventEditor';
import { CalendarMonthView } from './CalendarMonthView';
import { CalendarYearView } from './CalendarYearView';
import { calendarEpicSurface } from './calendarEntrySurface';
import { useCalendarEditor } from './useCalendarEditor';
import { useCalendarEntryDrag } from './useCalendarEntryDrag';
import { useCalendarQuery } from './useCalendarQuery';
import { useCalendarTasks } from './useCalendarTasks';

type ViewMode = 'week' | 'month' | 'year';

/** Top breathing room (label overhang) + bottom slack for the week grid. */
const WEEK_GRID_RESERVE_PX = 10;
/** Height of one all-day chip row in the week header strip. */
const ALL_DAY_CHIP_HEIGHT_PX = 22;
const ALL_DAY_CHIP_GAP_PX = 3;

interface CalendarModalProps {
  onClose: () => void;
  closing?: boolean;
}

export function CalendarModal({ onClose, closing = false }: CalendarModalProps): JSX.Element {
  const t = useT();
  const [locale] = useLocale();
  const [now, setNow] = useState(() => new Date());
  const todayKey = toDayKey(now);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date(), locale));
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [operationError, setOperationError] = useState<Error | null>(null);
  const captureOperationError = useCallback((err: unknown) => {
    setOperationError(err instanceof Error ? err : new Error(String(err)));
  }, []);
  const { tasks, loaded: tasksLoaded, refresh: refreshTasks } = useCalendarTasks(captureOperationError);
  const {
    entries,
    googleFetchFailed,
    googleReauthNeeded,
    showGoogleReauthBanner,
    dismissGoogleReauthBanner,
  } = useCalendarQuery({ viewMode, weekStart, monthDate, viewYear }, tasks);
  const googleError = googleFetchFailed ? t('nordly.calendar.google_error') : null;
  const showGridLoading = !tasksLoaded;

  useEffect(() => {
    if (viewMode === 'year') setViewYear(weekStart.getFullYear());
  }, [viewMode, weekStart]);

  useEffect(() => {
    setWeekStart((prev) => startOfWeekMonday(prev, locale));
  }, [locale]);

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
  const yearEntries = useMemo(() => entriesForYear(entries, viewYear), [entries, viewYear]);
  const hours = useMemo(() => calendarHourLabels(), []);

  const weekScrollRef = useRef<HTMLDivElement>(null);

  const gridSpan = CALENDAR_GRID_END_HOUR - CALENDAR_GRID_START_HOUR;
  const [hourHeight, setHourHeight] = useState(CALENDAR_HOUR_HEIGHT_PX);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(tick);
  }, []);
  useLayoutEffect(() => {
    if (viewMode !== 'week') return;
    const el = weekScrollRef.current;
    if (!el) return;
    const recompute = () => {
      const slot = el.clientHeight - WEEK_GRID_RESERVE_PX;
      if (slot <= 0) return;
      const h = Math.floor(slot / gridSpan);
      setHourHeight(Math.max(1, h));
    };
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [gridSpan, viewMode]);
  const gridHeight = gridSpan * hourHeight;
  const nowHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const nowTop = (nowHour - CALENDAR_GRID_START_HOUR) * hourHeight;
  const showNowLine =
    viewMode === 'week' &&
    nowHour >= CALENDAR_GRID_START_HOUR &&
    nowHour <= CALENDAR_GRID_END_HOUR;

  const weekTimedLayouts = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutTimedEntriesForDay>>();
    for (const { dayKey } of weekDays) {
      map.set(dayKey, layoutTimedEntriesForDay(timedEntriesForDay(weekEntries, dayKey), hourHeight));
    }
    return map;
  }, [weekDays, weekEntries, hourHeight]);

  const { dragId, dragTop, start: startDrag } = useVerticalDrag();

  const handleGoogleWriteError = useCallback(
    (err: unknown) => {
      if (err instanceof GoogleReauthError) {
        void refreshGoogleCalendarCache();
        return;
      }
      setOperationError(err instanceof Error ? err : new Error(String(err)));
    },
    [],
  );
  const {
    editor,
    saving: savingEvent,
    openEntry: openEditorForEntry,
    openTaskRange: openCreateTaskRange,
    setTitle: setEditorTitle,
    close: closeEditor,
    save: saveEditor,
    deleteEvent: deleteEditorEvent,
  } = useCalendarEditor({
    refreshTasks,
    onError: captureOperationError,
    onGoogleError: handleGoogleWriteError,
  });

  const reconnect = useCallback(async () => {
    try {
      const url = await getGoogleCalendarAuthURL();
      openExternalUrl(url);
    } catch (err) {
      setOperationError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const commitDrag = useCalendarEntryDrag(
    hourHeight,
    captureOperationError,
    handleGoogleWriteError,
  );

  const { selection: rangeSelection, onColumnPointerDown } = useCalendarRangeSelect({
    hourHeight,
    gridHeight,
    onCommit: ({ start, end }) => openCreateTaskRange(start, end),
  });

  const createTaskFromWeekSlot = useCallback(
    (dayKey: string, offsetTop: number) => {
      const [y, m, d] = dayKey.split('-').map(Number);
      const startH = offsetTop / hourHeight + CALENDAR_GRID_START_HOUR;
      const min = snapMinutes(startH * 60);
      const start = new Date(y, m - 1, d, Math.floor(min / 60), min % 60, 0, 0);
      const end = new Date(start.getTime() + 30 * 60_000);
      openCreateTaskRange(start, end);
    },
    [hourHeight, openCreateTaskRange],
  );

  const headerLabel =
    viewMode === 'week'
      ? formatWeekHeaderMonth(weekStart, locale)
      : viewMode === 'month'
        ? formatLocaleDate(monthDate, locale, { month: 'long', year: 'numeric' })
        : String(viewYear);

  const timeZoneLabel = useMemo(
    () => formatTimeZoneLabel(getUserTimeZone(), locale),
    [locale],
  );

  const shiftPeriod = (delta: number) => {
    if (viewMode === 'week') {
      setWeekStart((prev) => {
        const next = new Date(prev);
        next.setDate(prev.getDate() + delta * 7);
        return next;
      });
      return;
    }
    if (viewMode === 'month') {
      setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
      return;
    }
    setViewYear((y) => y + delta);
  };

  const openTask = useCallback(
    (taskId: string) => {
      window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.navOpenTask, { detail: { taskId } }));
    },
    [],
  );

  const onEntryClick = useCallback(
    (entry: CalendarEntry) => {
      if (entry.source === 'task' && entry.taskId) {
        openTask(entry.taskId);
        return;
      }
      if (entry.source === 'google') openEditorForEntry(entry);
    },
    [openTask, openEditorForEntry],
  );

  const viewOptions = useMemo(
    () => [
      { value: 'week' as const, label: t('nordly.calendar.view_week') },
      { value: 'month' as const, label: t('nordly.calendar.view_month') },
      { value: 'year' as const, label: t('nordly.calendar.view_year') },
    ],
    [t],
  );

  if (operationError) throw operationError;

  return (
    <div
      className="nordly-calendar-backdrop fadein"
      data-closing={closing ? 'true' : undefined}
      style={{ zIndex: zIndex.modal }}
      onClick={onClose}
    >
      <div
        className={`nordly-calendar-modal motion-modal-in ${closing ? 'slide-to-right' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('nordly.calendar.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="nordly-calendar-toolbar">
          <div className="nordly-calendar-toolbar__left">
            <h2 className="nordly-calendar-toolbar__title">{headerLabel}</h2>
            <div className="nordly-calendar-toolbar__nav">
              <button
                type="button"
                className="nordly-calendar-nav-btn focus-ring"
                onClick={() => shiftPeriod(-1)}
                aria-label={t('nordly.calendar.prev')}
              >
                <Icon name="chevron-left" size={14} />
              </button>
              <button
                type="button"
                className="nordly-calendar-nav-btn focus-ring"
                onClick={() => shiftPeriod(1)}
                aria-label={t('nordly.calendar.next')}
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
          </div>
          <SegmentedControl
            ariaLabel={t('nordly.calendar.view_mode')}
            value={viewMode}
            options={viewOptions}
            onChange={setViewMode}
          />
        </header>

        {showGoogleReauthBanner ? (
          <div className="nordly-calendar-banner" role="status">
            <span>{t('nordly.calendar.google_reauth')}</span>
            <div className="nordly-calendar-banner__actions">
              <button type="button" className="nordly-calendar-banner__btn focus-ring" onClick={() => void reconnect()}>
                {t('nordly.calendar.reconnect')}
              </button>
              <button
                type="button"
                className="nordly-calendar-banner__close focus-ring"
                aria-label={t('nordly.sync.banner_dismiss')}
                onClick={dismissGoogleReauthBanner}
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        <div className="nordly-calendar-body" data-loading={showGridLoading ? 'true' : undefined}>
        {viewMode === 'week' ? (
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
                <div className="nordly-calendar-week__allday-label mono">
                  {t('nordly.calendar.all_day')}
                </div>
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
                    <span
                      key={hour}
                      className="nordly-calendar-week__time"
                      style={{ height: hourHeight }}
                    >
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
                        <div
                          key={hour}
                          className="nordly-calendar-week__cell"
                          style={{ height: hourHeight }}
                        />
                      ))}
                      {rangeSelection?.dayKey === dayKey && (
                        <div
                          className="nordly-calendar-selection"
                          style={{ top: rangeSelection.top, height: rangeSelection.height }}
                          aria-hidden
                        />
                      )}
                      {showNowLine && dayKey === todayKey && (
                        <div
                          className="nordly-calendar-now-line"
                          style={{ top: nowTop }}
                          aria-hidden
                        />
                      )}
                      {weekTimedLayouts.get(dayKey)?.map(({ entry, top: layoutTop, height, column, columnCount }) => {
                          const maxTop = Math.max(0, gridHeight - height);
                          const isDragging = dragId === entry.id;
                          const top = Math.max(
                            0,
                            Math.min(isDragging ? dragTop : layoutTop, maxTop),
                          );
                          const draggable =
                            (entry.source === 'task' && Boolean(entry.taskId)) ||
                            (entry.source === 'google' &&
                              Boolean(entry.googleEditable) &&
                              !entry.allDay);
                          return (
                            <CalendarEventBlock
                              key={entry.id}
                              entry={entry}
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
                                        onCommit: (ft) => void commitDrag(entry, ft),
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
        ) : viewMode === 'month' ? (
          <CalendarMonthView
            monthDate={monthDate}
            entries={entries}
            todayKey={todayKey}
            locale={locale}
            onPickDay={(day) => {
              setWeekStart(startOfWeekMonday(day, locale));
              setViewMode('week');
            }}
            onCreateDay={(day) => {
              const start = new Date(day);
              start.setHours(9, 0, 0, 0);
              const end = new Date(start.getTime() + 30 * 60_000);
              openCreateTaskRange(start, end);
            }}
            onEntryClick={onEntryClick}
          />
        ) : (
          <CalendarYearView
            year={viewYear}
            entries={yearEntries}
            todayKey={todayKey}
            locale={locale}
            onPickMonth={(monthIndex) => {
              setMonthDate(new Date(viewYear, monthIndex, 1));
              setViewMode('month');
            }}
          />
        )}
        </div>

        <p className="nordly-calendar-footnote mono">
          {t('nordly.calendar.timezone', { zone: timeZoneLabel })}
          {` · ${t('nordly.calendar.create_task_hint')}`}
          {` · ${t('nordly.calendar.create_dblclick_hint')}`}
        </p>
        {googleError && isCloudEnabled() && !googleReauthNeeded && (
          <p className="nordly-calendar-footnote mono">{googleError}</p>
        )}
      </div>

      {editor && (
        <CalendarEventEditor
          editor={editor}
          saving={savingEvent}
          locale={locale}
          onTitleChange={setEditorTitle}
          onSave={() => void saveEditor()}
          onDelete={() => void deleteEditorEvent()}
          onClose={closeEditor}
        />
      )}
    </div>
  );
}

function AllDayEventChip({
  entry,
  onActivate,
}: {
  entry: CalendarEntry;
  onActivate: () => void;
}): JSX.Element {
  const { epics } = useTaskEpics();
  const isExternal = entry.source === 'google' || entry.source === 'apple';
  const epicSurface = calendarEpicSurface(entry, epics);
  return (
    <button
      type="button"
      className="nordly-calendar-allday-chip focus-ring"
      data-source={entry.source}
      data-epic={epicSurface ? 'true' : undefined}
      data-readonly={isExternal ? 'true' : undefined}
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
  top,
  height,
  column,
  columnCount,
  dragging,
  onPointerDown,
  onActivate,
}: {
  entry: CalendarEntry;
  top: number;
  height: number;
  column: number;
  columnCount: number;
  dragging?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onActivate: () => void;
}): JSX.Element {
  const { epics } = useTaskEpics();
  const done = entry.taskStatus === 'done';
  const isGoogle = entry.source === 'google';
  const interactive = Boolean(onPointerDown) || isGoogle || Boolean(entry.taskId);
  const epicSurface = calendarEpicSurface(entry, epics, { dragging });
  const style = {
    top,
    height,
    '--cal-col': column,
    '--cal-cols': columnCount,
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
        entry.source === 'apple' || (entry.source === 'google' && entry.googleEditable === false)
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

