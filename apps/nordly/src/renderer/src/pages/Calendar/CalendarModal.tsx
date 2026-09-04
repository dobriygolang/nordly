import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useT, useLocale } from '@nordly-i18n';

import { getGoogleCalendarAuthURL, GoogleReauthError, openExternalUrl } from '@features/calendar/api/calendarClient';
import { CalendarEventEditor } from '@features/calendar/components/CalendarEventEditor';
import { CalendarMonthView } from '@features/calendar/components/CalendarMonthView';
import { CalendarWeekView } from '@features/calendar/components/CalendarWeekView';
import { CalendarYearView } from '@features/calendar/components/CalendarYearView';
import { useCalendarEditor } from '@features/calendar/hooks/useCalendarEditor';
import { useCalendarQuery } from '@features/calendar/hooks/useCalendarQuery';
import { useCalendarTasks } from '@features/calendar/hooks/useCalendarTasks';
import { inspectCalendarEntry } from '@features/calendar/lib/calendarInspect';
import { CalendarViewMode } from '@features/calendar/lib/calendarQuery';
import {
  entriesForYear,
  formatWeekHeaderMonth,
  startOfWeekMonday,
  type CalendarEntry,
} from '@features/calendar/lib/events';
import { refreshGoogleCalendarCache } from '@features/calendar/api/googleCalendarState';
import { CalendarEntrySource } from '@features/calendar/model/entry';
import { TASK_DURATION_DEFAULT } from '@features/tasks/model/duration';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { useDialogFocus } from '@shared/hooks/useDialogFocus';
import { useTodayKey } from '@shared/hooks/useTodayKey';
import { buildDefaultScheduleDate } from '@shared/lib/dates';
import { formatLocaleDate, formatTimeZoneLabel, getUserTimeZone } from '@shared/lib/localeFormat';
import { zIndex } from '@shared/lib/z-index';
import { isCloudEnabled } from '@shared/model/features';
import { useWeekStartsOn } from '@shared/model/useWeekStartsOn';
import { SegmentedControl } from '@shared/ui/primitives/SegmentedControl';
import { Icon } from '@shared/ui/primitives/Icon';

type ViewMode = CalendarViewMode;

interface CalendarModalProps {
  onClose: () => void;
  closing?: boolean;
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
}

export function CalendarModal({ onClose, closing = false, onRegisterFlush }: CalendarModalProps): JSX.Element {
  const t = useT();
  const [locale] = useLocale();
  const weekStartsOn = useWeekStartsOn();
  const todayKey = useTodayKey();
  const [viewMode, setViewMode] = useState<ViewMode>(CalendarViewMode.Week);
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date(), locale));
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [operationError, setOperationError] = useState<Error | null>(null);
  const captureOperationError = useCallback((err: unknown) => {
    setOperationError(err instanceof Error ? err : new Error(String(err)));
  }, []);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  const { tasks, loaded: tasksLoaded, refresh: refreshTasks } = useCalendarTasks(captureOperationError);
  const {
    entries,
    googleFetchFailed,
    googleReauthNeeded,
    showGoogleReauthBanner,
    dismissGoogleReauthBanner,
  } = useCalendarQuery({ viewMode, weekStart, monthDate, viewYear }, tasks);
  const googleError = googleFetchFailed ? t('nordly.calendar.google_error') : null;
  const yearEntries = useMemo(() => entriesForYear(entries, viewYear), [entries, viewYear]);

  useEffect(() => {
    if (viewMode === CalendarViewMode.Year) setViewYear(weekStart.getFullYear());
  }, [viewMode, weekStart]);

  useEffect(() => {
    setWeekStart((prev) => startOfWeekMonday(prev, locale));
  }, [locale, weekStartsOn]);

  const handleGoogleWriteError = useCallback((err: unknown) => {
    if (err instanceof GoogleReauthError) {
      void refreshGoogleCalendarCache();
      return;
    }
    setOperationError(err instanceof Error ? err : new Error(String(err)));
  }, []);

  const {
    editor,
    saving: savingEvent,
    openTaskRange: openCreateTaskRange,
    setTitle: setEditorTitle,
    close: closeEditor,
    save: saveEditor,
    flushDirtyEdit,
    deleteEvent: deleteEditorEvent,
  } = useCalendarEditor({
    refreshTasks,
    onError: captureOperationError,
    onGoogleError: handleGoogleWriteError,
  });

  useEffect(() => {
    onRegisterFlush(flushDirtyEdit);
    return () => onRegisterFlush(null);
  }, [flushDirtyEdit, onRegisterFlush]);

  const reconnect = useCallback(async () => {
    try {
      const url = await getGoogleCalendarAuthURL();
      openExternalUrl(url);
    } catch (err) {
      setOperationError(err instanceof Error ? err : new Error(String(err)));
    }
  }, []);

  const headerLabel =
    viewMode === CalendarViewMode.Week
      ? formatWeekHeaderMonth(weekStart, locale)
      : viewMode === CalendarViewMode.Month
        ? formatLocaleDate(monthDate, locale, { month: 'long', year: 'numeric' })
        : String(viewYear);

  const timeZoneLabel = useMemo(
    () => formatTimeZoneLabel(getUserTimeZone(), locale),
    [locale],
  );

  const shiftPeriod = (delta: number) => {
    if (viewMode === CalendarViewMode.Week) {
      setWeekStart((prev) => {
        const next = new Date(prev);
        next.setDate(prev.getDate() + delta * 7);
        return next;
      });
      return;
    }
    if (viewMode === CalendarViewMode.Month) {
      setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
      return;
    }
    setViewYear((y) => y + delta);
  };

  const openTask = useCallback((taskId: string) => {
    window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.navOpenTask, { detail: { taskId } }));
  }, []);

  const onEntryClick = useCallback(
    (entry: CalendarEntry) => {
      if (entry.source === CalendarEntrySource.Task && entry.taskId) {
        if (entry.conferenceUrl) {
          inspectCalendarEntry(entry);
          return;
        }
        openTask(entry.taskId);
        return;
      }
      if (entry.source === CalendarEntrySource.Google || entry.source === CalendarEntrySource.Apple) {
        inspectCalendarEntry(entry);
      }
    },
    [openTask],
  );

  const viewOptions = useMemo(
    () => [
      { value: CalendarViewMode.Week, label: t('nordly.calendar.view_week') },
      { value: CalendarViewMode.Month, label: t('nordly.calendar.view_month') },
      { value: CalendarViewMode.Year, label: t('nordly.calendar.view_year') },
    ],
    [t],
  );

  return (
    <div
      className="nordly-calendar-backdrop fadein"
      data-closing={closing ? 'true' : undefined}
      style={{ zIndex: zIndex.modal }}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={`nordly-calendar-modal motion-modal-in ${closing ? 'slide-to-right' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('nordly.calendar.title')}
        tabIndex={-1}
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

        {operationError ? (
          <div className="nordly-calendar-banner" role="alert">
            <span>{operationError.message}</span>
            <div className="nordly-calendar-banner__actions">
              <button
                type="button"
                className="nordly-calendar-banner__close focus-ring"
                aria-label={t('nordly.sync.banner_dismiss')}
                onClick={() => setOperationError(null)}
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

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

        <div className="nordly-calendar-body" data-loading={!tasksLoaded ? 'true' : undefined}>
          {viewMode === CalendarViewMode.Week ? (
            <CalendarWeekView
              weekStart={weekStart}
              entries={entries}
              todayKey={todayKey}
              locale={locale}
              onEntryClick={onEntryClick}
              onCreateRange={openCreateTaskRange}
              onError={captureOperationError}
              onGoogleError={handleGoogleWriteError}
            />
          ) : viewMode === CalendarViewMode.Month ? (
            <CalendarMonthView
              monthDate={monthDate}
              entries={entries}
              todayKey={todayKey}
              locale={locale}
              onPickDay={(day) => {
                setWeekStart(startOfWeekMonday(day, locale));
                setViewMode(CalendarViewMode.Week);
              }}
              onCreateDay={(day) => {
                const start = buildDefaultScheduleDate(day);
                openCreateTaskRange(start, new Date(start.getTime() + TASK_DURATION_DEFAULT * 60_000));
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
                setViewMode(CalendarViewMode.Month);
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
