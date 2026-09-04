import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';

import { emit } from '@tauri-apps/api/event';

import { translate } from '@nordly-i18n';

import { CanvasBg } from '@widgets/CanvasBg';
import { type ThemeId, readStoredTheme } from '@shared/model/theme';
import { Wordmark, AppVersionBadge } from '@widgets/Chrome';
import { TitlebarDrag } from '@widgets/TitlebarDrag';
import { TrafficLightsHover } from '@widgets/TrafficLightsHover';
import { Dock } from '@widgets/Dock';
import { PomodoroController } from '@widgets/PomodoroController';
import { PageId, PaletteAction, isPageId } from '@shared/model/navigation';
import { SyncStatusBanner } from '@widgets/SyncStatusBanner';
import { ReauthLoginOverlay } from '@widgets/ReauthLoginOverlay';
import { VaultUnlockGate } from '@widgets/VaultUnlockGate';
import { parseDayKey, toDayKey } from '@shared/lib/dates';
import { HomePage } from '@pages/Home';
import { patchSettings } from '@shared/model/settings';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import { applyTheme, isLightTheme } from '@shared/lib/applyTheme';
import { isTauriRuntime } from '@platform/runtime';
import { subscribeVaultEnabled } from '@shared/crypto/vaultPrefs';
import { listenEffect } from '@shared/lib/tauriListen';
import { usePomodoroStore, type PomodoroStartArgs } from '@shared/model/pomodoro';
import { rejectPendingCloudAuth, resetAuthRefreshState } from '@shared/api/authSession';
import {
  AuthKind,
  AuthStatus,
  useSessionStore,
} from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';
import { PageStack } from '@shared/ui/PageStack';
import { ScreenFade } from '@shared/ui/ScreenFade';
import { useGlobalHotkeys } from '@shared/hooks/useGlobalHotkeys';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { MOTION_MS } from '@shared/lib/motionMs';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useBackgroundWorkers } from './hooks/useBackgroundWorkers';
import { useDeepLinkNavigation } from './hooks/useDeepLinkNavigation';
import { usePaletteTaskCreation } from './hooks/usePaletteTaskCreation';
import { useTaskRollover } from './hooks/useTaskRollover';
import {
  classifyBackgroundError,
  normalizeError,
  shouldSurfaceBackgroundError,
} from './backgroundErrorPolicy';

const TaskBoardPage = lazy(() => import('@pages/TaskBoard').then((m) => ({ default: m.TaskBoardPage })));
const NotesPage = lazy(() => import('@pages/Notes').then((m) => ({ default: m.NotesPage })));
const SettingsPage = lazy(() => import('@pages/Settings').then((m) => ({ default: m.SettingsPage })));
const WhiteboardPage = lazy(() =>
  import('@pages/Whiteboard').then((m) => ({ default: m.WhiteboardPage })),
);
const CalendarPage = lazy(() =>
  import('@pages/Calendar/CalendarModal').then((m) => ({ default: m.CalendarModal })),
);
const DailyPlanningPage = lazy(() =>
  import('@pages/DailyPlanning/DailyPlanningModal').then((m) => ({
    default: m.DailyPlanningModal,
  })),
);
const Palette = lazy(() =>
  import('@widgets/Palette').then((m) => ({ default: m.Palette })),
);
const HomeTodayTasks = lazy(() =>
  import('@widgets/HomeTodayTasks').then((m) => ({ default: m.HomeTodayTasks })),
);
const AppleEventInspectorHost = lazy(() =>
  import('@features/calendar/components/AppleEventInspectorHost').then((m) => ({
    default: m.AppleEventInspectorHost,
  })),
);
const AnimatedStatsOverlay = lazy(() =>
  import('@widgets/AnimatedStatsOverlay').then((m) => ({ default: m.AnimatedStatsOverlay })),
);

/** Must match palette close transition (`--motion-dur-medium`). */
const PALETTE_CLOSE_MS = MOTION_MS.medium;

function preloadPalettePages(): void {
  const reportPreloadFailure = (error: unknown): void => {
    console.warn('[nordly:app] page preload failed', error);
  };
  void import('@pages/TaskBoard').catch(reportPreloadFailure);
  void import('@pages/DailyPlanning/DailyPlanningModal').catch(reportPreloadFailure);
  void import('@pages/Settings').catch(reportPreloadFailure);
}

type StartFocusArgs = PomodoroStartArgs;

function boardCanvasForTheme(theme: ThemeId): BoardCanvasTheme {
  return isLightTheme(theme) ? 'light' : 'dark';
}

export default function App() {
  const status = useSessionStore((s) => s.status);
  const userId = useSessionStore((s) => s.userId);
  const sessionReauthRequired = useSyncStore((s) => s.sessionReauthRequired);
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const hydrate = useSessionStore((s) => s.hydrate);
  const clear = useSessionStore((s) => s.clear);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMounted, setPaletteMounted] = useState(false);
  const [paletteClosing, setPaletteClosing] = useState(false);
  const [paletteTaskDate, setPaletteTaskDate] = useState<Date | null>(null);
  const [theme, setTheme] = useState<ThemeId>(() => readStoredTheme());
  const [boardCanvas, setBoardCanvas] = useState<BoardCanvasTheme>(
    () => boardCanvasForTheme(readStoredTheme()),
  );
  const [vaultGateActive, setVaultGateActive] = useState(false);
  const [vaultPrefsReady, setVaultPrefsReady] = useState(false);
  const [reauthOpen, setReauthOpen] = useState(false);

  useEffect(() => {
    return subscribeVaultEnabled((enabled) => {
      setVaultGateActive(enabled);
    });
  }, []);

  const [operationError, setOperationError] = useState<Error | null>(null);
  const captureOperationError = useCallback((error: unknown) => {
    if (!shouldSurfaceBackgroundError(error)) {
      console.error(
        `[nordly:app] ${classifyBackgroundError(error)} background error`,
        error,
      );
      return;
    }
    setOperationError(normalizeError(error));
  }, []);
  const {
    page,
    statsOpen,
    taskOpenRequest,
    noteOpenRequest,
    navigateTo,
    goHome,
    openStats,
    closeStats,
    openCalendar,
    closeCalendar,
    openPlanning,
    closePlanning,
    openTaskRequest,
    openNoteRequest,
    consumeTaskOpenRequest,
    consumeNoteOpenRequest,
    registerPageFlush,
  } = useAppNavigation(captureOperationError);

  useEffect(() => {
    applyTheme(theme);
    const nextBoardCanvas = boardCanvasForTheme(theme);
    setBoardCanvas(nextBoardCanvas);
    try {
      patchSettings({ boardCanvas: nextBoardCanvas });
    } catch (error) {
      captureOperationError(error);
    }
    if (isTauriRuntime()) {
      void emit('theme:sync', theme).catch(captureOperationError);
    }
  }, [captureOperationError, theme]);

  useBackgroundWorkers({
    status,
    userId,
    sessionReauthRequired,
    vaultPrefsReady,
    setVaultGateActive,
    setVaultPrefsReady,
    onError: captureOperationError,
  });
  useTaskRollover(status, captureOperationError);

  useEffect(() => {
    const openReauth = (): void => setReauthOpen(true);
    window.addEventListener(NORDLY_EVENTS.openReauthLogin, openReauth);
    return () => window.removeEventListener(NORDLY_EVENTS.openReauthLogin, openReauth);
  }, []);

  useEffect(() => {
    // Definitive cloud reauth cleared → close sticky reauth overlay.
    // Local-profile auth overlay is closed only via success / explicit dismiss.
    if (
      !sessionReauthRequired &&
      useSessionStore.getState().authKind === AuthKind.Cloud
    ) {
      setReauthOpen(false);
    }
  }, [sessionReauthRequired]);

  useEffect(() => {
    void bootstrap().catch(captureOperationError);
    const bridge = typeof window !== 'undefined' ? window.nordly : undefined;
    if (!bridge) return;

    const offAuth = bridge.on('authChanged', (session) => {
      if (session) {
        // Ignore stale auth_persist emissions after explicit sign-out to local.
        if (
          useSessionStore.getState().authKind === AuthKind.Local &&
          !session.accessToken
        ) {
          return;
        }
        void hydrate({
          userId: session.userId,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
        }).catch(captureOperationError);
        resetAuthRefreshState();
      } else {
        void clear({ skipNativeLogout: true }).catch(captureOperationError);
      }
    });

    return () => {
      offAuth();
    };
  }, [bootstrap, captureOperationError, clear, hydrate]);

  const startFocus = useCallback(
    async (args?: StartFocusArgs): Promise<boolean> => {
      if (!(await navigateTo(PageId.Home))) return false;
      usePomodoroStore.getState().start(args);
      return true;
    },
    [navigateTo],
  );

  useDeepLinkNavigation({
    navigateTo,
    openTask: openTaskRequest,
    openNote: openNoteRequest,
    startFocus,
    onError: captureOperationError,
  });

  const openImpl = useCallback(
    (id: PaletteAction, args?: StartFocusArgs) => {
      if (args) {
        void startFocus(args).catch(captureOperationError);
        return;
      }
      if (id === PaletteAction.Stats) {
        void openStats().catch(captureOperationError);
        return;
      }
      if (id === PageId.Calendar) {
        void openCalendar().catch(captureOperationError);
        return;
      }
      if (id === PageId.Planning) {
        void openPlanning().catch(captureOperationError);
        return;
      }
      if (!isPageId(id)) return;
      void navigateTo(id).catch(captureOperationError);
    },
    [
      startFocus,
      navigateTo,
      openStats,
      openCalendar,
      openPlanning,
      captureOperationError,
    ],
  );

  const openPalette = useCallback((taskDate?: Date | null) => {
    preloadPalettePages();
    setPaletteTaskDate(taskDate ?? null);
    setPaletteOpen(true);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    return listenEffect('app:open-palette', () => {
      openPalette();
    });
  }, [openPalette]);

  const closePalette = useCallback(() => {
    setPaletteOpen(false);
    setPaletteTaskDate(null);
  }, []);

  useEffect(() => {
    if (paletteOpen) {
      setPaletteMounted(true);
      setPaletteClosing(false);
      return;
    }
    if (!paletteMounted) return;
    setPaletteClosing(true);
    const t = window.setTimeout(() => {
      setPaletteMounted(false);
      setPaletteClosing(false);
    }, PALETTE_CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [paletteOpen, paletteMounted]);

  const handlePaletteSelect = useCallback(
    (id: PaletteAction) => {
      closePalette();
      openImpl(id);
    },
    [closePalette, openImpl],
  );

  const handlePaletteCreateTask = usePaletteTaskCreation({
    closePalette,
    onError: captureOperationError,
  });

  useEffect(() => {
    const onAddTask = (e: Event) => {
      const dayKey = (e as CustomEvent<{ dayKey?: string }>).detail?.dayKey;
      const todayKey = toDayKey(new Date());
      const date =
        dayKey && dayKey !== todayKey ? parseDayKey(dayKey) : new Date();
      openPalette(date);
    };
    window.addEventListener(NORDLY_EVENTS.openPaletteAddTask, onAddTask);
    return () => window.removeEventListener(NORDLY_EVENTS.openPaletteAddTask, onAddTask);
  }, [openPalette]);

  useGlobalHotkeys({
    page,
    paletteOpen,
    statsOpen,
    calendarOpen: page === PageId.Calendar,
    planningOpen: page === PageId.Planning,
    setPaletteOpen: (fn) => {
      const next = fn(paletteOpen);
      if (next) openPalette();
      else closePalette();
    },
    goHome,
    openStats,
    closeStats,
    openCalendar,
    closeCalendar,
    openPlanning,
    closePlanning,
    open: (id) => openImpl(id),
  });

  const renderPage = useMemo(
    () =>
      function renderPage(id: PageId) {
        switch (id) {
          case PageId.Home:
            return <HomePage />;
          case PageId.Today:
            return (
              <TaskBoardPage
                openRequest={taskOpenRequest}
                onConsumeOpenRequest={consumeTaskOpenRequest}
              />
            );
          case PageId.Notes:
            return (
              <NotesPage
                openRequest={noteOpenRequest}
                onConsumeOpenRequest={consumeNoteOpenRequest}
                onRegisterFlush={registerPageFlush}
              />
            );
          case PageId.Whiteboard:
            return <WhiteboardPage boardCanvas={boardCanvas} onRegisterFlush={registerPageFlush} />;
          case PageId.Calendar:
            return <CalendarPage onClose={() => navigateTo(PageId.Home)} onRegisterFlush={registerPageFlush} />;
          case PageId.Planning:
            return (
              <DailyPlanningPage
                onClose={() => navigateTo(PageId.Home)}
                onRegisterFlush={registerPageFlush}
              />
            );
          case PageId.Settings:
            return (
              <SettingsPage
                theme={theme}
                onThemeChange={setTheme}
                boardCanvas={boardCanvas}
                onBoardCanvasChange={setBoardCanvas}
                onPomoChange={(secs) => usePomodoroStore.getState().setDurationSec(secs)}
                onTimerModeChange={(mode) => usePomodoroStore.getState().setMode(mode)}
                onBack={() => navigateTo(PageId.Home)}
              />
            );
          default:
            return null;
        }
      },
    [
      theme,
      boardCanvas,
      navigateTo,
      taskOpenRequest,
      noteOpenRequest,
      consumeTaskOpenRequest,
      consumeNoteOpenRequest,
      registerPageFlush,
    ],
  );

  const posterBoost = statsOpen || paletteMounted;

  const renderScreen = (screenId: string): JSX.Element => {
    if (screenId === 'loading') {
      return (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', color: 'var(--ink-40)', display: 'grid', placeItems: 'center', fontSize: 13 }}>
          {translate('nordly.app.loading')}
        </div>
      );
    }

    // ScreenFade keeps the signed-in layer mounted briefly during logout crossfade.
    if (status !== AuthStatus.SignedIn || !userId) {
      return <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }} aria-hidden />;
    }

    const closeAuthOverlay = (): void => {
      setReauthOpen(false);
      rejectPendingCloudAuth();
    };

    const signedInShell = (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden' }}>
        <div
          className="nordly-canvas-shell"
          data-visible={page === PageId.Home ? 'true' : 'false'}
          data-boost={posterBoost ? 'true' : 'false'}
        >
          <CanvasBg
            mode={page === PageId.Home ? 'full' : 'quiet'}
            theme={theme}
            boost={posterBoost}
          />
        </div>

        <TitlebarDrag />

        <SyncStatusBanner />

        {operationError ? (
          <div className="nordly-sync-banner" role="alert" data-kind="reauth" data-no-drag>
            <span className="nordly-sync-banner__text">{operationError.message}</span>
            <div className="nordly-sync-banner__actions">
              <button
                type="button"
                className="nordly-sync-banner__close focus-ring"
                aria-label={translate('nordly.sync.banner_dismiss')}
                onClick={() => setOperationError(null)}
              >
                ×
              </button>
            </div>
          </div>
        ) : null}

        {reauthOpen ? <ReauthLoginOverlay onClose={closeAuthOverlay} /> : null}

        <TrafficLightsHover />
        <div className="nordly-chrome-shell" data-visible={page === PageId.Home ? 'true' : 'false'}>
          <Wordmark />
          <AppVersionBadge />
        </div>

        {page === PageId.Home ? (
          <Suspense fallback={null}>
            <HomeTodayTasks />
          </Suspense>
        ) : null}

        <PageStack page={page}>{renderPage}</PageStack>

        {page === PageId.Home ? (
          <Suspense fallback={null}>
            <AnimatedStatsOverlay open={statsOpen} onClose={closeStats} />
          </Suspense>
        ) : null}

        <PomodoroController />
        <Suspense fallback={null}>
          <AppleEventInspectorHost />
        </Suspense>

        <Dock onMenu={() => openPalette()} />

        {paletteMounted && (
          <Suspense fallback={null}>
            <Palette
              onClose={closePalette}
              onOpen={handlePaletteSelect}
              taskDate={paletteTaskDate}
              onCreateTask={handlePaletteCreateTask}
              closing={paletteClosing}
            />
          </Suspense>
        )}
      </div>
    );

    return vaultGateActive ? <VaultUnlockGate>{signedInShell}</VaultUnlockGate> : signedInShell;
  };

  const sessionReady =
    status === AuthStatus.SignedIn && userId != null && vaultPrefsReady;
  const screen =
    status === AuthStatus.Unknown ? 'loading' : sessionReady ? 'app' : 'loading';

  return <ScreenFade screen={screen}>{renderScreen}</ScreenFade>;
}
