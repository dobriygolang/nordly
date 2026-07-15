import { useEffect, useState } from 'react';

import { useLocale, useT } from '@nordly-i18n';

import {
  getAppleCalendarEvent,
  openAppleCalendarEvent,
  type AppleCalendarEventDetail,
} from '@features/calendar/api/appleCalendarClient';
import { openExternalUrl } from '@features/calendar/api/calendarClient';
import type { CalendarInspectPayload } from '@features/calendar/lib/calendarInspect';
import { parseScheduleInstant } from '@shared/lib/dates';
import { formatLocaleDate, formatLocaleTime } from '@shared/lib/localeFormat';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { zIndex } from '@shared/lib/z-index';

type InspectorView = {
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  calendarLabel?: string;
  location?: string;
  notes?: string;
  linkUrl?: string;
  linkLabel?: string;
  openExternal?: { label: string; run: () => void };
};

function formatWhen(
  start: Date,
  end: Date,
  allDay: boolean,
  locale: 'en' | 'ru',
  allDayLabel: string,
): string {
  const day = formatLocaleDate(start, locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  if (allDay) return `${day} · ${allDayLabel}`;
  return `${day} · ${formatLocaleTime(start, locale)}–${formatLocaleTime(end, locale)}`;
}

function fromApple(detail: AppleCalendarEventDetail, openInCalendarLabel: string): InspectorView {
  return {
    title: detail.title,
    start: new Date(detail.start),
    end: new Date(detail.end),
    allDay: detail.allDay,
    calendarLabel: detail.calendarTitle,
    location: detail.location,
    notes: detail.notes,
    linkUrl: detail.url,
    openExternal: {
      label: openInCalendarLabel,
      run: () => {
        void openAppleCalendarEvent(detail.id).catch((err: unknown) => {
          console.warn('[CalendarEventInspector] open Calendar.app failed:', err);
        });
      },
    },
  };
}

function fromPayload(payload: CalendarInspectPayload, t: (key: string) => string): InspectorView | null {
  if (payload.source === 'google') {
    return {
      title: payload.title,
      start: parseScheduleInstant(payload.start),
      end: parseScheduleInstant(payload.end),
      allDay: payload.allDay,
      calendarLabel: t('nordly.calendar.inspect.source_google'),
      linkUrl: payload.htmlLink,
      openExternal: payload.htmlLink
        ? {
            label: t('nordly.calendar.inspect.open_in_google'),
            run: () => openExternalUrl(payload.htmlLink!),
          }
        : undefined,
    };
  }
  if (payload.source === 'task') {
    return {
      title: payload.title,
      start: parseScheduleInstant(payload.start),
      end: parseScheduleInstant(payload.end),
      allDay: false,
      calendarLabel: t('nordly.calendar.inspect.source_meeting'),
      linkUrl: payload.conferenceUrl,
      linkLabel: payload.conferenceUrl
        ? t('nordly.calendar.inspect.join_meeting')
        : undefined,
      openExternal: payload.conferenceUrl
        ? {
            label: t('nordly.calendar.inspect.join_meeting'),
            run: () => openExternalUrl(payload.conferenceUrl!),
          }
        : undefined,
    };
  }
  return null;
}

/** Global host: Apple / Google / meeting-task detail sheet (no external Calendar.app by default). */
export function CalendarEventInspectorHost(): JSX.Element | null {
  const t = useT();
  const [locale] = useLocale();
  const [payload, setPayload] = useState<CalendarInspectPayload | null>(null);
  const [view, setView] = useState<InspectorView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onInspect = (e: Event) => {
      const detail = (e as CustomEvent<CalendarInspectPayload>).detail;
      if (!detail?.source) return;
      setPayload(detail);
      setView(null);
      setError(null);
      setLoading(detail.source === 'apple');
    };
    const onLegacyApple = (e: Event) => {
      const id = (e as CustomEvent<{ eventId?: string }>).detail?.eventId?.trim();
      if (!id) return;
      setPayload({ source: 'apple', eventId: id });
      setView(null);
      setError(null);
      setLoading(true);
    };
    window.addEventListener(NORDLY_EVENTS.calendarInspect, onInspect);
    window.addEventListener(NORDLY_EVENTS.appleCalendarInspect, onLegacyApple);
    return () => {
      window.removeEventListener(NORDLY_EVENTS.calendarInspect, onInspect);
      window.removeEventListener(NORDLY_EVENTS.appleCalendarInspect, onLegacyApple);
    };
  }, []);

  useEffect(() => {
    if (!payload) return;
    if (payload.source !== 'apple') {
      setView(fromPayload(payload, t));
      setLoading(false);
      return;
    }
    let cancelled = false;
    void getAppleCalendarEvent(payload.eventId)
      .then((next) => {
        if (cancelled) return;
        setView(fromApple(next, t('nordly.calendar.apple_detail.open_in_calendar')));
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setView(null);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payload, t]);

  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPayload(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload) return null;

  const close = () => setPayload(null);
  const heading =
    payload.source === 'google'
      ? t('nordly.calendar.inspect.title_google')
      : payload.source === 'task'
        ? t('nordly.calendar.inspect.title_meeting')
        : t('nordly.calendar.apple_detail.title');

  return (
    <div
      className="nordly-calendar-editor-scrim"
      style={{ zIndex: zIndex.modal + 2 }}
      onClick={close}
    >
      <div
        className="nordly-calendar-editor nordly-calendar-apple-detail motion-pop-in"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="nordly-calendar-editor__heading">{heading}</h3>
        {loading ? (
          <p className="nordly-calendar-editor__note mono">{t('nordly.calendar.apple_detail.loading')}</p>
        ) : null}
        {error ? <p className="nordly-calendar-editor__note mono">{error}</p> : null}
        {view ? (
          <>
            <p className="nordly-calendar-apple-detail__title">{view.title}</p>
            <p className="nordly-calendar-editor__when mono">
              {formatWhen(view.start, view.end, view.allDay, locale, t('nordly.calendar.all_day'))}
            </p>
            {view.calendarLabel ? (
              <p className="nordly-calendar-editor__note mono">{view.calendarLabel}</p>
            ) : null}
            {view.location ? (
              <p className="nordly-calendar-apple-detail__body">
                <span className="nordly-calendar-apple-detail__label">
                  {t('nordly.calendar.apple_detail.location')}
                </span>
                {view.location}
              </p>
            ) : null}
            {view.linkUrl ? (
              <p className="nordly-calendar-apple-detail__body">
                <button
                  type="button"
                  className="nordly-calendar-apple-detail__link"
                  onClick={() => openExternalUrl(view.linkUrl!)}
                >
                  {view.linkLabel ?? view.linkUrl}
                </button>
              </p>
            ) : null}
            {view.notes ? (
              <p className="nordly-calendar-apple-detail__notes">{view.notes}</p>
            ) : null}
          </>
        ) : null}
        <div className="nordly-calendar-editor__actions">
          {view?.openExternal ? (
            <button type="button" className="nordly-calendar-editor__btn" onClick={view.openExternal.run}>
              {view.openExternal.label}
            </button>
          ) : null}
          <span className="nordly-calendar-editor__spacer" />
          <button type="button" className="nordly-calendar-editor__btn" onClick={close}>
            {t('nordly.calendar.apple_detail.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** @deprecated use CalendarEventInspectorHost */
export const AppleEventInspectorHost = CalendarEventInspectorHost;
