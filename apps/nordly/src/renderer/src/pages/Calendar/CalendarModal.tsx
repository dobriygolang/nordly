import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useT, useLocale, type Locale } from '@nordly-i18n';

import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getGoogleCalendarAuthURL,
  getTrackerSettings,
  listGoogleCalendarEvents,
  openExternalUrl,
  updateGoogleCalendarEvent,
  GoogleReauthError,
  type GoogleCalendarEvent,
} from '@features/calendar/api/calendarClient';
import {
  buildMonthGrid,
  buildWeekDays,
  calendarHourLabels,
  entriesForDay,
  entriesForWeek,
  entriesForYear,
  eventBlockLayout,
  formatDayHeader,
  formatHourLabel,
  formatWeekHeaderMonth,
  mergeCalendarEntries,
  monthRange,
  startOfWeekMonday,
  weekRange,
  yearRange,
  CALENDAR_GRID_END_HOUR,
  CALENDAR_GRID_START_HOUR,
  CALENDAR_HOUR_HEIGHT_PX,
  type CalendarEntry,
} from '@features/calendar/lib/events';
import { listTasks, scheduleTask, type TaskCard } from '@features/tasks/api/tasks';
import { SegmentedControl } from '@pages/Settings/primitives/SegmentedControl';
import { snapMinutes, toDayKey } from '@pages/TaskBoard/lib/dates';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { formatLocaleDate, formatLocaleTime, formatTimeZoneLabel, getUserTimeZone } from '@shared/lib/localeFormat';
import { useVerticalDrag } from '@shared/lib/useVerticalDrag';
import { zIndex } from '@shared/lib/z-index';
import { Icon } from '@shared/ui/primitives/Icon';
import { LOCAL_ONLY } from '@app/config/features';

type ViewMode = 'week' | 'month' | 'year';

/** Top breathing room (label overhang) + bottom slack for the week grid. */
const WEEK_GRID_RESERVE_PX = 10;
/** Background refresh cadence so edits made in Google appear without reopening. */
const GOOGLE_AUTO_REFRESH_MS = 60_000;

type EditorState =
  | { mode: 'create'; start: Date; end: Date; title: string; calendarId?: string }
  | { mode: 'edit'; entry: CalendarEntry; title: string };

interface CalendarModalProps {
  onClose: () => void;
  closing?: boolean;
}

export function CalendarModal({ onClose, closing = false }: CalendarModalProps): JSX.Element {
  const t = useT();
  const [locale] = useLocale();
  const todayKey = toDayKey(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date(), locale));
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [googleEvents, setGoogleEvents] = useState<GoogleCalendarEvent[]>([]);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [reauthNeeded, setReauthNeeded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [savingEvent, setSavingEvent] = useState(false);

  const refreshTasks = useCallback(async () => {
    try {
      setTasks(await listTasks());
    } catch {
      /* keep stale */
    }
  }, []);

  const currentRange = useCallback((): { start: Date; end: Date } => {
    if (viewMode === 'week') return weekRange(weekStart);
    if (viewMode === 'month') return monthRange(monthDate);
    return yearRange(viewYear);
  }, [viewMode, weekStart, monthDate, viewYear]);

  const refreshGoogle = useCallback(async () => {
    if (LOCAL_ONLY) {
      setGoogleEvents([]);
      setGoogleError(null);
      return;
    }
    const { start, end } = currentRange();
    const padStart = new Date(start);
    padStart.setDate(padStart.getDate() - 7);
    const padEnd = new Date(end);
    padEnd.setDate(padEnd.getDate() + 7);
    try {
      setGoogleEvents(await listGoogleCalendarEvents(padStart, padEnd));
      setGoogleError(null);
      setReauthNeeded(false);
    } catch (err) {
      if (err instanceof GoogleReauthError) {
        setReauthNeeded(true);
        setGoogleError(t('nordly.calendar.google_reauth'));
      } else {
        setGoogleError(t('nordly.calendar.google_error'));
      }
    }
  }, [currentRange, t]);

  const refreshConnection = useCallback(async () => {
    if (LOCAL_ONLY) return;
    try {
      const s = await getTrackerSettings();
      setConnected(s.googleCalendarConnected);
      setReauthNeeded(s.googleReauthRequired);
    } catch {
      /* leave prior state */
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'year') setViewYear(weekStart.getFullYear());
  }, [viewMode, weekStart]);

  useEffect(() => {
    void refreshTasks();
    void refreshConnection();
  }, [refreshTasks, refreshConnection]);

  useEffect(() => {
    void refreshGoogle();
  }, [refreshGoogle]);

  useEffect(() => {
    setWeekStart((prev) => startOfWeekMonday(prev, locale));
  }, [locale]);

  // Auto-refresh (inbound): poll + refresh on window focus so Google-side edits
  // land without reopening the calendar.
  useEffect(() => {
    if (LOCAL_ONLY) return;
    const tick = () => void refreshGoogle();
    const id = window.setInterval(tick, GOOGLE_AUTO_REFRESH_MS);
    const onFocus = () => void refreshGoogle();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshGoogle]);

  useEffect(() => {
    const onTasks = () => void refreshTasks();
    const onSync = () => {
      void refreshTasks();
      void refreshGoogle();
    };
    window.addEventListener(NORDLY_EVENTS.tasksChanged, onTasks);
    window.addEventListener(NORDLY_EVENTS.syncChanged, onSync);
    return () => {
      window.removeEventListener(NORDLY_EVENTS.tasksChanged, onTasks);
      window.removeEventListener(NORDLY_EVENTS.syncChanged, onSync);
    };
  }, [refreshTasks, refreshGoogle]);

  const entries = useMemo(() => mergeCalendarEntries(tasks, googleEvents), [tasks, googleEvents]);

  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const weekEntries = useMemo(() => entriesForWeek(entries, weekStart), [entries, weekStart]);
  const yearEntries = useMemo(() => entriesForYear(entries, viewYear), [entries, viewYear]);
  const hours = useMemo(() => calendarHourLabels(), []);

  const weekScrollRef = useRef<HTMLDivElement>(null);

  const gridSpan = CALENDAR_GRID_END_HOUR - CALENDAR_GRID_START_HOUR;
  const [hourHeight, setHourHeight] = useState(CALENDAR_HOUR_HEIGHT_PX);
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

  const { dragId, dragTop, start: startDrag } = useVerticalDrag();

  const handleGoogleWriteError = useCallback(
    (err: unknown) => {
      if (err instanceof GoogleReauthError) {
        setReauthNeeded(true);
        setGoogleError(t('nordly.calendar.google_reauth'));
      } else {
        setGoogleError(t('nordly.calendar.google_error'));
      }
    },
    [t],
  );

  const reconnect = useCallback(async () => {
    try {
      const url = await getGoogleCalendarAuthURL();
      openExternalUrl(url);
    } catch {
      setGoogleError(t('nordly.calendar.google_error'));
    }
  }, [t]);

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
        try {
          await scheduleTask(entry.taskId, next, durationMin);
          window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
        } catch {
          /* next refresh reconciles */
        }
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
          await refreshGoogle();
        } catch (err) {
          handleGoogleWriteError(err);
        }
      }
    },
    [hourHeight, refreshGoogle, handleGoogleWriteError],
  );

  const openEditorForEntry = useCallback((entry: CalendarEntry) => {
    setEditor({ mode: 'edit', entry, title: entry.title });
  }, []);

  const openCreateAt = useCallback((start: Date, durationMin = 60) => {
    const end = new Date(start.getTime() + durationMin * 60_000);
    setEditor({ mode: 'create', start, end, title: '' });
  }, []);

  const createFromWeekSlot = useCallback(
    (dayKey: string, offsetTop: number) => {
      if (!connected || reauthNeeded) return;
      const [y, m, d] = dayKey.split('-').map(Number);
      const startH = offsetTop / hourHeight + CALENDAR_GRID_START_HOUR;
      const min = snapMinutes(startH * 60);
      const start = new Date(y, m - 1, d, Math.floor(min / 60), min % 60, 0, 0);
      openCreateAt(start);
    },
    [connected, reauthNeeded, hourHeight, openCreateAt],
  );

  const saveEditor = useCallback(async () => {
    if (!editor) return;
    const title = editor.title.trim();
    if (!title) return;
    setSavingEvent(true);
    try {
      if (editor.mode === 'create') {
        await createGoogleCalendarEvent({
          title,
          start: editor.start,
          end: editor.end,
          allDay: false,
        });
      } else if (editor.entry.googleEventId) {
        await updateGoogleCalendarEvent(editor.entry.googleEventId, {
          title,
          start: editor.entry.start,
          end: editor.entry.end,
          allDay: editor.entry.allDay,
          calendarId: editor.entry.googleCalendarId,
        });
      }
      setEditor(null);
      await refreshGoogle();
    } catch (err) {
      handleGoogleWriteError(err);
    } finally {
      setSavingEvent(false);
    }
  }, [editor, refreshGoogle, handleGoogleWriteError]);

  const deleteEditorEvent = useCallback(async () => {
    if (!editor || editor.mode !== 'edit' || !editor.entry.googleEventId) return;
    setSavingEvent(true);
    try {
      await deleteGoogleCalendarEvent(editor.entry.googleEventId, editor.entry.googleCalendarId);
      setEditor(null);
      await refreshGoogle();
    } catch (err) {
      handleGoogleWriteError(err);
    } finally {
      setSavingEvent(false);
    }
  }, [editor, refreshGoogle, handleGoogleWriteError]);

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

  const openTask = (taskId: string) => {
    window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.navOpenTask, { detail: { taskId } }));
    onClose();
  };

  const onEntryClick = useCallback(
    (entry: CalendarEntry) => {
      if (entry.source === 'task' && entry.taskId) {
        openTask(entry.taskId);
        return;
      }
      if (entry.source === 'google') openEditorForEntry(entry);
    },
    [openEditorForEntry],
  );

  const viewOptions = useMemo(
    () => [
      { value: 'week' as const, label: t('nordly.calendar.view_week') },
      { value: 'month' as const, label: t('nordly.calendar.view_month') },
      { value: 'year' as const, label: t('nordly.calendar.view_year') },
    ],
    [t],
  );

  const canCreate = connected && !reauthNeeded && !LOCAL_ONLY;

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

        {reauthNeeded && !LOCAL_ONLY && (
          <div className="nordly-calendar-banner" role="status">
            <span>{t('nordly.calendar.google_reauth')}</span>
            <button type="button" className="nordly-calendar-banner__btn focus-ring" onClick={() => void reconnect()}>
              {t('nordly.calendar.reconnect')}
            </button>
          </div>
        )}

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
                      onDoubleClick={
                        canCreate
                          ? (e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              createFromWeekSlot(dayKey, e.clientY - rect.top);
                            }
                          : undefined
                      }
                    >
                      {hours.map((hour) => (
                        <div
                          key={hour}
                          className="nordly-calendar-week__cell"
                          style={{ height: hourHeight }}
                        />
                      ))}
                      {weekEntries
                        .filter((e) => toDayKey(e.start) === dayKey)
                        .map((entry) => {
                          const layout = eventBlockLayout(entry, hourHeight);
                          if (!layout) return null;
                          const maxTop = Math.max(0, gridHeight - layout.height);
                          const isDragging = dragId === entry.id;
                          const top = Math.max(
                            0,
                            Math.min(isDragging ? dragTop : layout.top, maxTop),
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
                              height={layout.height}
                              dragging={isDragging}
                              onPointerDown={
                                draggable
                                  ? (e) =>
                                      startDrag(e, {
                                        id: entry.id,
                                        baseTop: layout.top,
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
            onCreateDay={
              canCreate
                ? (day) => {
                    const start = new Date(day);
                    start.setHours(9, 0, 0, 0);
                    openCreateAt(start);
                  }
                : undefined
            }
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

        <p className="nordly-calendar-footnote mono">
          {t('nordly.calendar.timezone', { zone: timeZoneLabel })}
          {canCreate ? ` · ${t('nordly.calendar.create_hint')}` : ''}
        </p>
        {googleError && !LOCAL_ONLY && !reauthNeeded && (
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

function CalendarEventBlock({
  entry,
  top,
  height,
  dragging,
  onPointerDown,
  onActivate,
}: {
  entry: CalendarEntry;
  top: number;
  height: number;
  dragging?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onActivate: () => void;
}): JSX.Element {
  const done = entry.taskStatus === 'done';
  const isGoogle = entry.source === 'google';
  const interactive = Boolean(onPointerDown) || isGoogle || Boolean(entry.taskId);
  const style: React.CSSProperties = {
    top,
    height,
    zIndex: dragging ? 5 : undefined,
    boxShadow: dragging ? '0 10px 28px rgb(0 0 0 / 0.5)' : undefined,
    cursor: onPointerDown ? (dragging ? 'grabbing' : 'grab') : interactive ? 'pointer' : undefined,
    touchAction: onPointerDown ? 'none' : undefined,
    userSelect: 'none',
  };

  return (
    <button
      type="button"
      className="nordly-calendar-event focus-ring"
      data-source={isGoogle ? 'google' : 'task'}
      data-done={done ? 'true' : undefined}
      data-readonly={isGoogle && !entry.googleEditable ? 'true' : undefined}
      style={style}
      onPointerDown={onPointerDown}
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
  const entry = isEdit ? editor.entry : null;
  const readOnly = isEdit && entry ? entry.googleEditable === false : false;
  const start = isEdit ? entry!.start : editor.start;
  const end = isEdit ? entry!.end : editor.end;
  const when = `${formatLocaleDate(start, locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${formatLocaleTime(start, locale)}–${formatLocaleTime(end, locale)}`;

  return (
    <div className="nordly-calendar-editor-scrim" style={{ zIndex: zIndex.modal + 1 }} onClick={onClose}>
      <div
        className="nordly-calendar-editor motion-pop-in"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? t('nordly.calendar.editor.edit_title') : t('nordly.calendar.editor.create_title')}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="nordly-calendar-editor__heading">
          {isEdit ? t('nordly.calendar.editor.edit_title') : t('nordly.calendar.editor.create_title')}
        </h3>
        <input
          ref={inputRef}
          className="nordly-calendar-editor__input focus-ring"
          value={editor.title}
          placeholder={t('nordly.calendar.editor.title_placeholder')}
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
              {dayEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="nordly-calendar-month__chip"
                  data-source={entry.source}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEntryClick(entry);
                  }}
                  title={entry.title}
                >
                  {entry.title}
                </button>
              ))}
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
