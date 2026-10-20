import { useEffect, useState } from 'react';

import { countDueCards } from '@features/cards/api/cardsClient';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { readSettings } from '@shared/model/settings';

export function useDueCardCount(): { enabled: boolean; count: number | null; error: string | null } {
  const [enabled, setEnabled] = useState(() => readSettings().flashcards.enabled);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const syncEnabled = () => setEnabled(readSettings().flashcards.enabled);
    window.addEventListener(NORDLY_EVENTS.settingsChanged, syncEnabled);
    return () => window.removeEventListener(NORDLY_EVENTS.settingsChanged, syncEnabled);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      setError(null);
      return;
    }
    let cancelled = false;
    void countDueCards()
      .then((next) => {
        if (!cancelled) setCount(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { enabled, count, error };
}
