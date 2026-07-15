import { useCallback, useEffect, useState } from 'react';

import { toDayKey } from '@shared/lib/dates';

const MIDNIGHT_SLACK_MS = 100;

function currentTodayKey(): string {
  return toDayKey(new Date());
}

function millisecondsUntilTomorrow(): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, tomorrow.getTime() - now.getTime()) + MIDNIGHT_SLACK_MS;
}

/** Live local-day key that updates at midnight and after the app resumes. */
export function useTodayKey(): string {
  const [todayKey, setTodayKey] = useState(currentTodayKey);

  const refresh = useCallback(() => {
    setTodayKey(currentTodayKey());
  }, []);

  useEffect(() => {
    let timer = window.setTimeout(function onMidnight() {
      refresh();
      timer = window.setTimeout(onMidnight, millisecondsUntilTomorrow());
    }, millisecondsUntilTomorrow());

    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  return todayKey;
}
