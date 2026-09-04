import { useEffect, useMemo, useState } from 'react';

import { calendarQueryRange, type CalendarViewSelection } from '@features/calendar/lib/calendarQuery';
import { mergeCalendarEntries, type CalendarEntry } from '@features/calendar/lib/events';
import { useAppleCalendarEvents } from '@features/calendar/lib/useAppleCalendarEvents';
import { useGoogleCalendarConnection } from '@features/calendar/lib/useGoogleCalendarConnection';
import { useGoogleCalendarEvents } from '@features/calendar/lib/useGoogleCalendarEvents';
import {
  CalendarProviderErrorKind,
  type CalendarProviderError,
} from '@features/calendar/model/provider';
import type { TaskCard } from '@features/tasks/model/task';
import { isCloudEnabled } from '@shared/model/features';
import { useAppleCalendarEnabled } from '@shared/model/useAppleCalendarEnabled';
import { useSyncStore } from '@shared/model/sync';

export interface CalendarQueryResult {
  entries: CalendarEntry[];
  providerErrors: CalendarProviderError[];
  googleFetchFailed: boolean;
  googleReauthNeeded: boolean;
  showGoogleReauthBanner: boolean;
  dismissGoogleReauthBanner: () => void;
}

export function calendarQueryErrorState(
  googleError: CalendarProviderError | null,
  appleError: CalendarProviderError | null,
  connectionReauth: boolean,
): Pick<CalendarQueryResult, 'providerErrors' | 'googleFetchFailed' | 'googleReauthNeeded'> {
  const googleReauthNeeded =
    connectionReauth || googleError?.kind === CalendarProviderErrorKind.Reauth;
  return {
    providerErrors: [googleError, appleError].filter(
      (error): error is CalendarProviderError => error !== null,
    ),
    googleFetchFailed:
      googleError?.kind === CalendarProviderErrorKind.Fetch && !googleReauthNeeded,
    googleReauthNeeded,
  };
}

export function useCalendarQuery(
  selection: CalendarViewSelection,
  tasks: TaskCard[],
): CalendarQueryResult {
  const [googleReauthDismissed, setGoogleReauthDismissed] = useState(false);
  const sessionReauthRequired = useSyncStore((state) => state.sessionReauthRequired);
  const { viewMode, weekStart, monthDate, viewYear } = selection;
  const range = useMemo(
    () => calendarQueryRange({ viewMode, weekStart, monthDate, viewYear }),
    [viewMode, weekStart, monthDate, viewYear],
  );
  const {
    reauthRequired: connectionReauth,
    cachedEventsAvailable,
    error: connectionError,
  } = useGoogleCalendarConnection();
  const googleEnabled = isCloudEnabled() && cachedEventsAvailable;
  const appleCalendarEnabled = useAppleCalendarEnabled();
  const {
    events: googleEvents,
    error: googleEventError,
  } = useGoogleCalendarEvents(range.start, range.end, googleEnabled);
  const { events: appleEvents, error: appleError } = useAppleCalendarEvents(
    range.start,
    range.end,
    appleCalendarEnabled,
  );
  const errorState = calendarQueryErrorState(
    googleEventError ?? (cachedEventsAvailable ? connectionError : null),
    appleError,
    connectionReauth,
  );
  const { googleReauthNeeded } = errorState;

  useEffect(() => {
    if (!googleReauthNeeded) setGoogleReauthDismissed(false);
  }, [googleReauthNeeded]);

  const entries = useMemo(
    () => mergeCalendarEntries(tasks, googleEvents, appleEvents),
    [tasks, googleEvents, appleEvents],
  );

  return {
    entries,
    ...errorState,
    showGoogleReauthBanner:
      isCloudEnabled() &&
      cachedEventsAvailable &&
      googleReauthNeeded &&
      !sessionReauthRequired &&
      !googleReauthDismissed,
    dismissGoogleReauthBanner: () => setGoogleReauthDismissed(true),
  };
}
