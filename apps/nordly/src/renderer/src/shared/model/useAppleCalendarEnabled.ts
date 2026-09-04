import { useEffect, useState } from 'react';

import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { readAppleCalendarEnabled } from '@shared/model/settings';

/** Reactive Apple Calendar toggle from Nordly settings. */
export function useAppleCalendarEnabled(): boolean {
  const [enabled, setEnabled] = useState(readAppleCalendarEnabled);
  useEffect(() => {
    const sync = () => setEnabled(readAppleCalendarEnabled());
    window.addEventListener(NORDLY_EVENTS.settingsChanged, sync);
    return () => window.removeEventListener(NORDLY_EVENTS.settingsChanged, sync);
  }, []);
  return enabled;
}
