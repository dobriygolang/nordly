import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import { useT } from '@nordly-i18n';

import { getTrackerSettings, type TrackerSettings } from '@features/calendar/api/calendarClient';
import {
  applyTrackerSettings,
  getGoogleCalendarConnection,
  isGoogleCalendarConnectionFresh,
} from '@features/calendar/api/googleCalendarState';
import {
  integrationOAuthMailbox,
  type IntegrationOAuthEvent,
  type IntegrationOAuthResult,
} from '@shared/lib/integrationOAuthMailbox';
import { isCloudEnabled } from '@shared/model/features';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { OAuthStatus } from '@shared/model/oauth';

export const OAUTH_POLL_MS = 2_000;
export const OAUTH_POLL_MAX_MS = 3 * 60_000;

export function InlineOAuthSpinner(): JSX.Element {
  return <span className="nordly-inline-spinner" aria-hidden />;
}

export function useIntegrationOAuth({
  event,
  isConnected,
  afterLoad,
  errorKeys,
  logPrefix,
}: {
  event: IntegrationOAuthEvent;
  isConnected: (s: TrackerSettings) => boolean;
  afterLoad?: (s: TrackerSettings | null) => void | Promise<void>;
  errorKeys: {
    load: string;
    oauth: string;
    oauthTimeout: string;
    oauthDetail: string;
  };
  logPrefix: string;
}): {
  settings: TrackerSettings | null;
  setSettings: Dispatch<SetStateAction<TrackerSettings | null>>;
  loading: boolean;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  oauthPending: boolean;
  setOauthPending: Dispatch<SetStateAction<boolean>>;
  load: () => Promise<void>;
} {
  const t = useT();
  const [settings, setSettings] = useState<TrackerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthPending, setOauthPending] = useState(false);
  const loadGenerationRef = useRef(0);

  const load = useCallback(async () => {
    const generation = ++loadGenerationRef.current;
    if (!isCloudEnabled() || !isCloudApiAvailable()) {
      setSettings(null);
      setLoading(false);
      setError(null);
      await afterLoad?.(null);
      return;
    }
    if (isGoogleCalendarConnectionFresh()) {
      const cached = getGoogleCalendarConnection().settings;
      setSettings(cached);
      setLoading(false);
      setError(null);
      await afterLoad?.(cached);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await getTrackerSettings();
      if (generation !== loadGenerationRef.current) return;
      if (s) applyTrackerSettings(s);
      setSettings(s);
      await afterLoad?.(s);
    } catch (err) {
      if (generation !== loadGenerationRef.current) return;
      console.error(`[${logPrefix}] load settings failed`, err);
      setSettings(null);
      setError(t(errorKeys.load));
      await afterLoad?.(null);
    } finally {
      if (generation === loadGenerationRef.current) setLoading(false);
    }
  }, [afterLoad, errorKeys.load, logPrefix, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onOAuth = (detail: IntegrationOAuthResult): void => {
      setOauthPending(false);
      if (detail.status === OAuthStatus.Connected) {
        void load();
        return;
      }
      setError(
        detail.detail ? t(errorKeys.oauthDetail, { detail: detail.detail }) : t(errorKeys.oauth),
      );
    };
    return integrationOAuthMailbox.subscribe(event, onOAuth);
  }, [errorKeys.oauth, errorKeys.oauthDetail, event, load, t]);

  useEffect(() => {
    if (!oauthPending) return;

    let cancelled = false;
    let polling = false;
    const started = Date.now();

    const poll = async (): Promise<void> => {
      if (cancelled || polling || document.hidden) return;
      polling = true;
      try {
        const s = await getTrackerSettings();
        if (cancelled) return;
        if (s) applyTrackerSettings(s);
        if (s && isConnected(s)) {
          setSettings(s);
          await afterLoad?.(s);
          if (cancelled) return;
          setOauthPending(false);
          setError(null);
          return;
        }
      } catch (err) {
        if (!cancelled) {
          console.warn(`[${logPrefix}] oauth poll settings failed`, err);
        }
      } finally {
        polling = false;
      }
      if (cancelled) return;
      if (Date.now() - started >= OAUTH_POLL_MAX_MS) {
        setOauthPending(false);
        setError(t(errorKeys.oauthTimeout));
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), OAUTH_POLL_MS);
    const onFocus = (): void => {
      void poll();
    };
    window.addEventListener('focus', onFocus);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [afterLoad, errorKeys.oauthTimeout, isConnected, logPrefix, oauthPending, t]);

  return {
    settings,
    setSettings,
    loading,
    busy,
    setBusy,
    error,
    setError,
    oauthPending,
    setOauthPending,
    load,
  };
}
