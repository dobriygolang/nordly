import { useEffect, useMemo, useState } from 'react';

import {
  calendarQueryRange,
  mergeCalendarEntries,
  useAppleCalendarEvents,
  useGoogleCalendarConnection,
  useGoogleCalendarEvents,
  type CalendarEntry,
  type CalendarViewSelection,
} from '@features/calendar/api/calendar';
import type { TaskCard } from '@features/tasks/api/tasks';
import { isCloudEnabled } from '@shared/model/features';
import { useSyncStore } from '@shared/model/sync';

export interface CalendarQueryResult {
  entries: CalendarEntry[];
  googleFetchFailed: boolean;
  googleReauthNeeded: boolean;
  showGoogleReauthBanner: boolean;
  dismissGoogleReauthBanner: () => void;
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
    connected,
    reauthRequired: connectionReauth,
    ready: connectionReady,
  } = useGoogleCalendarConnection();
  const googleEnabled = isCloudEnabled() && connected && connectionReady;
  const {
    events: googleEvents,
    error: googleFetchError,
  } = useGoogleCalendarEvents(range.start, range.end, googleEnabled);
  const { events: appleEvents } = useAppleCalendarEvents(range.start, range.end, true);
  const googleReauthNeeded = connectionReauth;

  useEffect(() => {
    if (!googleReauthNeeded) setGoogleReauthDismissed(false);
  }, [googleReauthNeeded]);

  const entries = useMemo(
    () => mergeCalendarEntries(tasks, googleEvents, appleEvents),
    [tasks, googleEvents, appleEvents],
  );

  return {
    entries,
    googleFetchFailed: googleFetchError === 'fetch' && !googleReauthNeeded,
    googleReauthNeeded,
    showGoogleReauthBanner:
      isCloudEnabled() &&
      connected &&
      googleReauthNeeded &&
      !sessionReauthRequired &&
      !googleReauthDismissed,
    dismissGoogleReauthBanner: () => setGoogleReauthDismissed(true),
  };
}
