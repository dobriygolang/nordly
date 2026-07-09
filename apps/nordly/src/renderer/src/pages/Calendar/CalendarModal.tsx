import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useT, useLocale, type Locale } from '@nordly-i18n';

import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getGoogleCalendarAuthURL,
  openExternalUrl,
  updateGoogleCalendarEvent,
  GoogleReauthError,
} from '@features/calendar/api/calendarClient';
import { useAppleCalendarEvents } from '@features/calendar/lib/useAppleCalendarEvents';
import { useGoogleCalendarConnection } from '@features/calendar/lib/useGoogleCalendarConnection';
import { useGoogleCalendarEvents } from '@features/calendar/lib/useGoogleCalendarEvents';
import {
  buildMonthGrid,
  buildWeekDays,
  calendarHourLabels,
  allDayEntriesForDay,
  entriesForDay,
  entriesForWeek,
  entriesForYear,
  formatDayHeader,
  formatEntryTime,
  formatHourLabel,
  formatWeekHeaderMonth,
  layoutTimedEntriesForDay,
  mergeCalendarEntries,
  monthRange,
  startOfWeekMonday,
  timedEntriesForDay,
  weekRange,
  yearRange,
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  CALENDAR_HOUR_HEIGHT_PX,
  type CalendarEntry,
} from '@features/calendar/lib/events';
import { listTasks, createTask, scheduleTask, type TaskCard } from '@features/tasks/api/tasks';
import { SegmentedControl } from '@shared/ui/primitives/SegmentedControl';
import { snapMinutes, toDayKey } from '@shared/lib/dates';
import { epicEntrySurface, resolveTaskEpicColor } from '@features/tasks/lib/epicColor';
import { useTaskEpics } from '@features/tasks/lib/useTaskEpics';
import type { TaskEpic } from '@features/tasks/api/epics';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { formatLocaleDate, formatLocaleTime, formatTimeZoneLabel, getUserTimeZone } from '@shared/lib/localeFormat';
import { useVerticalDrag } from '@shared/lib/useVerticalDrag';
import { useCalendarRangeSelect } from '@features/calendar/lib/useCalendarRangeSelect';
import { refreshGoogleCalendarCache } from '@features/calendar/lib/googleCalendarSyncWorker';
import { zIndex } from '@shared/lib/z-index';
import { Icon } from '@shared/ui/primitives/Icon';
import { isCloudEnabled } from '@shared/model/features';

type ViewMode = 'week' | 'month' | 'year';

/** Top breathing room (label overhang) + bottom slack for the week grid. */
const WEEK_GRID_RESERVE_PX = 10;
/** Height of one all-day chip row in the week header strip. */
const ALL_DAY_CHIP_HEIGHT_PX = 22;
const ALL_DAY_CHIP_GAP_PX = 3;

type EditorState =
  | { mode: 'create'; kind: 'google' | 'task'; start: Date; end: Date; title: string }
  | { mode: 'edit'; entry: CalendarEntry; title: string };

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
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);
  const [operationError, setOperationError] = useState<Error | null>(null);

  const {
    connected,
    reauthRequired: connectionReauth,
    ready: connectionReady,
  } = useGoogleCalendarConnection();

  const refreshTasks = useCallback(async () => {
    setTasks(await listTasks());
    setTasksLoaded(true);
    setOperationError(null);
  }, []);

  const googleRange = useMemo(() => {
    let start: Date;
    let end: Date;
    if (viewMode === 'week') ({ start, end } = weekRange(weekStart));
    else if (viewMode === 'month') ({ start, end } = monthRange(monthDate));
    else ({ start, end } = yearRange(viewYear));
    const padStart = new Date(start);
    padStart.setDate(padStart.getDate() - 7);
    const padEnd = new Date(end);
    padEnd.setDate(padEnd.getDate() + 7);
    return { padStart, padEnd };
  }, [viewMode, weekStart, monthDate, viewYear]);

  const googleEnabled = isCloudEnabled() && connected && connectionReady;
  const {
    events: googleEvents,
    error: googleFetchError,
    reauthRequired: fetchReauth,
  } = useGoogleCalendarEvents(googleRange.padStart, googleRange.padEnd, googleEnabled);
  const { events: appleEvents } = useAppleCalendarEvents(
    googleRange.padStart,
    googleRange.padEnd,
    true,
  );

  const reauthNeeded = connectionReauth || fetchReauth;
  const googleError =
    googleFetchError === 'fetch' && !reauthNeeded ? t('nordly.calendar.google_error') : null;
  const showGridLoading = !tasksLoaded;

  useEffect(() => {
    if (viewMode === 'year') setViewYear(weekStart.getFullYear());
  }, [viewMode, weekStart]);

  useEffect(() => {
    void refreshTasks().catch((err: unknown) => setOperationError(err instanceof Error ? err : new Error(String(err))));
  }, [refreshTasks]);

  useEffect(() => {
    setWeekStart((prev) => startOfWeekMonday(prev, locale));
  }, [locale]);

  useEffect(() => {
    const onTasks = () => void refreshTasks().catch((err: unknown) => setOperationError(err instanceof Error ? err : new Error(String(err))));
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasks);
    return () => window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasks);
  }, [refreshTasks]);

  const entries = useMemo(
    () => mergeCalendarEntries(tasks, googleEvents, appleEvents),
    [tasks, googleEvents, appleEvents],
  );

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

  const reconnect = useCallback(async () => {
    try {
      const url = await getGoogleCalendarAuthURL();
      openExternalUrl(url);
    } catch (err) {
      setOperationError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const commitDrag = useCallback(
    async (entry: CalendarEntry, finalTop: number) => {
      const startH = finalTop / hourHeight + CALENDAR_GRID_START_HOUR;
      const min = snapMinutes(startH * 60);
      const next = new Date(entry.start);
      next.setHours(Math.floor(min / 60), min % 60, 0, 0);
      const durationMin = Math.max(
        15,
        Math.round((entry.end.getTime() - entry.start.getTime()) / 60_000),
      );
      if (entry.source === 'task' && entry.taskId) {
        await scheduleTask(entry.taskId, next, durationMin);
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
        return;
      }
      if (entry.source === 'google' && entry.googleEventId && entry.googleEditable) {
        const end = new Date(next.getTime() + durationMin * 60_000);
        try {
          await updateGoogleCalendarEvent(entry.googleEventId, {
            title: entry.title,
            start: next,
            end,
            allDay: false,
            calendarId: entry.googleCalendarId,
          });
          await refreshGoogleCalendarCache();
        } catch (err) {
          handleGoogleWriteError(err);
        }
      }
    },
    [hourHeight, handleGoogleWriteError],
  );

  const openEditorForEntry = useCallback((entry: CalendarEntry) => {
    setEditor({ mode: 'edit', entry, title: entry.title });
  }, []);

  const openCreateTaskRange = useCallback((start: Date, end: Date) => {
    setEditor({ mode: 'create', kind: 'task', start, end, title: '' });
  }, []);

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

  const saveEditor = useCallback(async () => {
    if (!editor) return;
    const title = editor.title.trim();
    if (!title) return;
    setSavingEvent(true);
    try {
      if (editor.mode === 'create' && editor.kind === 'task') {
        const durationMin = Math.max(
          15,
          Math.round((editor.end.getTime() - editor.start.getTime()) / 60_000),
        );
        const task = await createTask({ title });
        await scheduleTask(task.id, editor.start, durationMin);
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
        setEditor(null);
        await refreshTasks();
      } else if (editor.mode === 'create') {
        await createGoogleCalendarEvent({
          title,
          start: editor.start,
          end: editor.end,
          allDay: false,
        });
        setEditor(null);
        await refreshGoogleCalendarCache();
      } else if (editor.entry.googleEventId) {
        await updateGoogleCalendarEvent(editor.entry.googleEventId, {
          title,
          start: editor.entry.start,
          end: editor.entry.end,
          allDay: editor.entry.allDay,
          calendarId: editor.entry.googleCalendarId,
        });
        setEditor(null);
        await refreshGoogleCalendarCache();
      }
    } catch (err) {
      if (editor.mode === 'create' && editor.kind === 'task') {
        setOperationError(err instanceof Error ? err : new Error(String(err)));
      } else {
        handleGoogleWriteError(err);
      }
    } finally {
      setSavingEvent(false);
    }
  }, [editor, refreshTasks, handleGoogleWriteError]);

  const deleteEditorEvent = useCallback(async () => {
    if (!editor || editor.mode !== 'edit' || !editor.entry.googleEventId) return;
    setSavingEvent(true);
    try {
      await deleteGoogleCalendarEvent(editor.entry.googleEventId, editor.entry.googleCalendarId);
      setEditor(null);
      await refreshGoogleCalendarCache();
    } catch (err) {
      handleGoogleWriteError(err);
    } finally {
      setSavingEvent(false);
    }
  }, [editor, handleGoogleWriteError]);

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

        {reauthNeeded && isCloudEnabled() && (
          <div className="nordly-calendar-banner" role="status">
            <span>{t('nordly.calendar.google_reauth')}</span>
            <button type="button" className="nordly-calendar-banner__btn focus-ring" onClick={() => void reconnect()}>
              {t('nordly.calendar.reconnect')}
            </button>
          </div>
        )}

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
          <MonthGrid
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
          <YearGrid
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
        {googleError && isCloudEnabled() && !reauthNeeded && (
          <p className="nordly-calendar-footnote mono">{googleError}</p>
        )}
      </div>

      {editor && (
        <EventEditor
          editor={editor}
          saving={savingEvent}
          locale={locale}
          onTitleChange={(title) => setEditor((prev) => (prev ? { ...prev, title } : prev))}
          onSave={() => void saveEditor()}
          onDelete={() => void deleteEditorEvent()}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function calendarEpicSurface(
  entry: CalendarEntry,
  epics: TaskEpic[],
  opts?: { dragging?: boolean },
): Record<string, string> | null {
  if (entry.source !== 'task') return null;
  const color = resolveTaskEpicColor(
    { epicId: entry.epicId, epicColor: entry.epicColor },
    epics,
  );
  return epicEntrySurface(color, {
    done: entry.taskStatus === 'done',
    dragging: opts?.dragging,
  });
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

function EventEditor({
  editor,
  saving,
  locale,
  onTitleChange,
  onSave,
  onDelete,
  onClose,
}: {
  editor: EditorState;
  saving: boolean;
  locale: Locale;
  onTitleChange: (title: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}): JSX.Element {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const isEdit = editor.mode === 'edit';
  const isTaskCreate = editor.mode === 'create' && editor.kind === 'task';
  const entry = isEdit ? editor.entry : null;
  const readOnly = isEdit && entry ? entry.googleEditable === false : false;
  const start = isEdit ? entry!.start : editor.start;
  const end = isEdit ? entry!.end : editor.end;
  const when = entry?.allDay
    ? `${formatLocaleDate(start, locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatEntryTime(entry, locale)}`
    : `${formatLocaleDate(start, locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatLocaleTime(start, locale)}–${formatLocaleTime(end, locale)}`;

  const heading = isEdit
    ? t('nordly.calendar.editor.edit_title')
    : isTaskCreate
      ? t('nordly.calendar.editor.create_task_title')
      : t('nordly.calendar.editor.create_title');
  const placeholder = isTaskCreate
    ? t('nordly.calendar.editor.task_title_placeholder')
    : t('nordly.calendar.editor.title_placeholder');

  return (
    <div className="nordly-calendar-editor-scrim" style={{ zIndex: zIndex.modal + 1 }} onClick={onClose}>
      <div
        className="nordly-calendar-editor motion-pop-in"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="nordly-calendar-editor__heading">{heading}</h3>
        <input
          ref={inputRef}
          className="nordly-calendar-editor__input focus-ring"
          value={editor.title}
          placeholder={placeholder}
          disabled={readOnly || saving}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !readOnly) {
              e.preventDefault();
              onSave();
            }
            if (e.key === 'Escape') onClose();
          }}
        />
        <p className="nordly-calendar-editor__when mono">{when}</p>
        {readOnly && <p className="nordly-calendar-editor__note mono">{t('nordly.calendar.editor.readonly')}</p>}
        <div className="nordly-calendar-editor__actions">
          {isEdit && entry?.googleHtmlLink && (
            <button
              type="button"
              className="nordly-calendar-editor__btn"
              onClick={() => openExternalUrl(entry.googleHtmlLink!)}
            >
              {t('nordly.calendar.editor.open_in_google')}
            </button>
          )}
          {isEdit && !readOnly && (
            <button
              type="button"
              className="nordly-calendar-editor__btn nordly-calendar-editor__btn--danger"
              disabled={saving}
              onClick={onDelete}
            >
              {t('nordly.calendar.editor.delete')}
            </button>
          )}
          <span className="nordly-calendar-editor__spacer" />
          <button type="button" className="nordly-calendar-editor__btn" disabled={saving} onClick={onClose}>
            {t('nordly.calendar.editor.cancel')}
          </button>
          {!readOnly && (
            <button
              type="button"
              className="nordly-calendar-editor__btn nordly-calendar-editor__btn--primary"
              disabled={saving || !editor.title.trim()}
              onClick={onSave}
            >
              {t('nordly.calendar.editor.save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  monthDate,
  entries,
  todayKey,
  locale,
  onPickDay,
  onCreateDay,
  onEntryClick,
}: {
  monthDate: Date;
  entries: CalendarEntry[];
  todayKey: string;
  locale: Locale;
  onPickDay: (day: Date) => void;
  onCreateDay?: (day: Date) => void;
  onEntryClick: (entry: CalendarEntry) => void;
}): JSX.Element {
  const { epics } = useTaskEpics();
  const cells = useMemo(() => buildMonthGrid(monthDate, locale), [monthDate, locale]);
  const month = monthDate.getMonth();
  return (
    <div className="nordly-calendar-month">
      {cells.map((cell) => {
        const dayEntries = entriesForDay(entries, cell.dayKey).slice(0, 4);
        return (
          <div
            key={cell.dayKey}
            className="nordly-calendar-month__cell"
            data-outside={cell.date.getMonth() === month ? undefined : 'true'}
            data-today={cell.dayKey === todayKey ? 'true' : undefined}
            onClick={() => onPickDay(cell.date)}
            onDoubleClick={onCreateDay ? () => onCreateDay(cell.date) : undefined}
          >
            <span className="nordly-calendar-month__date">{cell.date.getDate()}</span>
            <div className="nordly-calendar-month__events">
              {dayEntries.map((entry) => {
                const epicSurface = calendarEpicSurface(entry, epics);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className="nordly-calendar-month__chip"
                    data-source={entry.source}
                    data-epic={epicSurface ? 'true' : undefined}
                    style={epicSurface ?? undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEntryClick(entry);
                    }}
                    title={entry.title}
                  >
                    {entry.title}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function YearGrid({
  year,
  entries,
  todayKey,
  locale,
  onPickMonth,
}: {
  year: number;
  entries: CalendarEntry[];
  todayKey: string;
  locale: Locale;
  onPickMonth: (monthIndex: number) => void;
}): JSX.Element {
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, monthIndex) => {
        const viewMonth = new Date(year, monthIndex, 1);
        const grid = buildMonthGrid(viewMonth, locale);
        return { monthIndex, viewMonth, grid };
      }),
    [year, locale],
  );

  return (
    <div className="nordly-calendar-year">
      {months.map(({ monthIndex, viewMonth, grid }) => {
        const label = formatLocaleDate(viewMonth, locale, { month: 'long' });
        return (
          <button
            key={monthIndex}
            type="button"
            className="nordly-calendar-year__month focus-ring"
            onClick={() => onPickMonth(monthIndex)}
          >
            <span className="nordly-calendar-year__label">{label}</span>
            <div className="nordly-calendar-year__grid">
              {grid.map((cell) => {
                const dayEntries = entriesForDay(entries, cell.dayKey);
                const hasTask = dayEntries.some((e) => e.source === 'task');
                const hasGoogle = dayEntries.some((e) => e.source === 'google');
                return (
                  <span
                    key={cell.dayKey}
                    className="nordly-calendar-year__cell"
                    data-outside={cell.inMonth ? undefined : 'true'}
                    data-today={cell.dayKey === todayKey ? 'true' : undefined}
                    data-busy={hasTask || hasGoogle ? 'true' : undefined}
                  >
                    {cell.inMonth ? cell.date.getDate() : ''}
                  </span>
                );
              })}
            </div>
          </button>
        );
      })}
    </div>
  );
}
