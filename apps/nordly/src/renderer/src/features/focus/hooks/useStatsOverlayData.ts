import { useEffect, useMemo, useState } from 'react';

import { getStats, padToSevenDays, sameNordlyStats, type NordlyStats } from '@features/focus/api/focusClient';
import { isApiHttpError } from '@shared/api/errors';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { usePomodoroStore } from '@shared/model/pomodoro';

export const FocusStatsFetchStatus = {
  Loading: 'loading',
  Ready: 'ready',
  Unauthenticated: 'unauthenticated',
  Failed: 'failed',
} as const;

type FetchState =
  | { status: typeof FocusStatsFetchStatus.Loading }
  | { status: typeof FocusStatsFetchStatus.Ready; data: NordlyStats }
  | { status: typeof FocusStatsFetchStatus.Unauthenticated; error: Error }
  | { status: typeof FocusStatsFetchStatus.Failed; error: Error };

type FetchFailure = Extract<
  FetchState,
  {
    status:
      | typeof FocusStatsFetchStatus.Unauthenticated
      | typeof FocusStatsFetchStatus.Failed;
  }
>;

const INITIAL: FetchState = { status: FocusStatsFetchStatus.Loading };

export function focusStatsFetchError(error: unknown): FetchFailure {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const unauthenticated =
    isApiHttpError(error, 401) || isApiHttpError(error, 403);
  return unauthenticated
    ? { status: FocusStatsFetchStatus.Unauthenticated, error: normalized }
    : { status: FocusStatsFetchStatus.Failed, error: normalized };
}

export function useStatsOverlayData() {
  const [state, setState] = useState<FetchState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    let requestSequence = 0;

    const load = (): void => {
      if (document.hidden) return;
      const request = ++requestSequence;
      void getStats()
        .then((data) => {
          if (cancelled || request !== requestSequence) return;
          setState((prev) => {
            if (
              prev.status === FocusStatsFetchStatus.Ready &&
              sameNordlyStats(prev.data, data)
            ) {
              return prev;
            }
            return { status: FocusStatsFetchStatus.Ready, data };
          });
        })
        .catch((err: unknown) => {
          if (cancelled || request !== requestSequence) return;
          const failure = focusStatsFetchError(err);
          setState((prev) => {
            if (
              prev.status === failure.status &&
              'error' in prev &&
              prev.error.message === failure.error.message
            ) {
              return prev;
            }
            return failure;
          });
        });
    };

    const onVisible = (): void => {
      if (document.visibilityState === 'visible') load();
    };

    load();
    window.addEventListener(NORDLY_EVENTS.syncChanged, load);
    document.addEventListener('visibilitychange', onVisible);
    const unsub = usePomodoroStore.subscribe((next, prev) => {
      if (prev.running && !next.running) load();
    });
    return () => {
      cancelled = true;
      window.removeEventListener(NORDLY_EVENTS.syncChanged, load);
      document.removeEventListener('visibilitychange', onVisible);
      unsub();
    };
  }, []);

  const data =
    state.status === FocusStatsFetchStatus.Ready ? state.data : null;
  const lastSeven = useMemo(
    () => padToSevenDays(data?.lastSevenDays ?? []),
    [data],
  );
  const sparkSeries = useMemo(() => lastSeven.map((d) => d.seconds), [lastSeven]);

  if (state.status === FocusStatsFetchStatus.Failed) {
    throw state.error;
  }

  return { state, data, lastSeven, sparkSeries };
}
