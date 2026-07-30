import { useEffect, useState } from 'react';

import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { readWeekStartsOn, type WeekStartsOn } from '@shared/model/settings';

/** Reactive first-day-of-week preference from Nordly settings. */
export function useWeekStartsOn(): WeekStartsOn {
  const [weekStartsOn, setWeekStartsOn] = useState(readWeekStartsOn);
  useEffect(() => {
    const sync = () => setWeekStartsOn(readWeekStartsOn());
    window.addEventListener(NORDLY_EVENTS.settingsChanged, sync);
    return () => window.removeEventListener(NORDLY_EVENTS.settingsChanged, sync);
  }, []);
  return weekStartsOn;
}
