import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';

import { emit } from '@tauri-apps/api/event';

import { translate } from '@nordly-i18n';

import { CanvasBg } from '@widgets/CanvasBg';
import { type ThemeId, readStoredTheme } from '@shared/model/theme';
import { Wordmark, AppVersionBadge } from '@widgets/Chrome';
import { TitlebarDrag } from '@widgets/TitlebarDrag';
import { TrafficLightsHover } from '@widgets/TrafficLightsHover';
import { Dock } from '@widgets/Dock';
import { LoginScreen } from '@widgets/LoginScreen';
import { AnimatedStatsOverlay } from '@widgets/AnimatedStatsOverlay';
import { PomodoroController } from '@widgets/PomodoroController';
import { type PageId, type PaletteAction } from '@shared/model/navigation';
import { SyncStatusBanner } from '@widgets/SyncStatusBanner';
import { ReauthLoginOverlay } from '@widgets/ReauthLoginOverlay';
import { VaultUnlockGate } from '@widgets/VaultUnlockGate';
import { createTask, listTasks, scheduleTask } from '@features/tasks/api/tasks';
import {
  parseDayKey,
  resolveScheduleStart,
  toDayKey,
} from '@shared/lib/dates';
import { HomePage } from '@pages/Home';
import { patchSettings } from '@shared/model/settings';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import { applyTheme, isLightTheme } from '@shared/lib/applyTheme';
import { isTauriRuntime } from '@platform/runtime';
import { subscribeVaultEnabled } from '@shared/crypto/vaultPrefs';
import { listenEffect } from '@shared/lib/tauriListen';
import { usePomodoroStore, type PomodoroStartArgs } from '@shared/model/pomodoro';
import { resetAuthRefreshState } from '@shared/api/authSession';
import { useSessionStore } from '@shared/model/session';
import { useSyncStore } from '@shared/model/sync';
import { PageStack } from '@shared/ui/PageStack';
import { ScreenFade } from '@shared/ui/ScreenFade';
import { useGlobalHotkeys } from '@shared/hooks/useGlobalHotkeys';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { MOTION_MS } from '@shared/lib/motionMs';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useBackgroundWorkers } from './hooks/useBackgroundWorkers';
import { useDeepLinkNavigation } from './hooks/useDeepLinkNavigation';
import { useTaskRollover } from './hooks/useTaskRollover';

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

/** Must match palette close transition (`--motion-dur-medium`). */
const PALETTE_CLOSE_MS = MOTION_MS.medium;

function preloadPalettePages(): void {
  void import('@pages/TaskBoard');
  void import('@pages/DailyPlanning/DailyPlanningModal');
  void import('@pages/Notes');
  void import('@pages/Settings');
  void import('@pages/Whiteboard');
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
  const [reauthOpen, setReauthOpen] = useState(false);

  useEffect(() => {
    return subscribeVaultEnabled((enabled) => {
      setVaultGateActive(enabled);
    });
  }, []);

  const [operationError, setOperationError] = useState<Error | null>(null);
  const captureOperationError = useCallback((error: unknown) => {
    // Auth/network blips must not tear down the signed-in shell (feels like logout).
    const msg = error instanceof Error ? error.message : String(error);
    const recoverable =
      /session expired|missing access token|failed to fetch|load failed|network|offline|no internet|server unreachable/i.test(
        msg,
      );
    if (recoverable) {
      console.error('[nordly:app] recoverable background error', error);
      return;
    }
    setOperationError(error instanceof Error ? error : new Error(String(error)));
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
    registerNotesFlush,
    beforeNavigate,
  } = useAppNavigation();

  useEffect(() => {
    applyTheme(theme);
    const nextBoardCanvas = boardCanvasForTheme(theme);
    setBoardCanvas(nextBoardCanvas);
    patchSettings({ boardCanvas: nextBoardCanvas });
    if (isTauriRuntime()) {
      void emit('theme:sync', theme);
    }
  }, [theme]);

  useBackgroundWorkers({
    status,
    userId,
    sessionReauthRequired,
    setVaultGateActive,
    onError: captureOperationError,
  });
  useTaskRollover(status, captureOperationError);

  useEffect(() => {
    const openReauth = (): void => setReauthOpen(true);
    window.addEventListener(NORDLY_EVENTS.openReauthLogin, openReauth);
    return () => window.removeEventListener(NORDLY_EVENTS.openReauthLogin, openReauth);
  }, []);

  useEffect(() => {
    if (!sessionReauthRequired) setReauthOpen(false);
  }, [sessionReauthRequired]);

  useEffect(() => {
    void bootstrap();
    const bridge = typeof window !== 'undefined' ? window.nordly : undefined;
    if (!bridge) return;

    const offAuth = bridge.on('authChanged', (session) => {
      if (session) {
        // Ignore stale auth_persist emissions after explicit sign-out.
        if (useSessionStore.getState().status === 'guest') return;
        void hydrate({
          userId: session.userId,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
        });
        resetAuthRefreshState();
      } else {
        void clear({ skipNativeLogout: true });
      }
    });

    return () => {
      offAuth();
    };
  }, [bootstrap, clear, hydrate]);

  const startFocus = useCallback(
    (args?: StartFocusArgs) => {
      usePomodoroStore.getState().start(args);
      navigateTo('home');
    },
    [navigateTo],
  );

  useDeepLinkNavigation({
    navigateTo,
    beforeNavigate,
    openTask: openTaskRequest,
    openNote: openNoteRequest,
    startFocus,
    onError: captureOperationError,
  });

  const openImpl = useCallback(
    (id: PaletteAction, args?: StartFocusArgs) => {
      if (args) {
        startFocus(args);
        return;
      }
      if (id === 'stats') {
        openStats();
        return;
      }
      if (id === 'calendar') {
        openCalendar();
        return;
      }
      if (id === 'planning') {
        openPlanning();
        return;
      }
      navigateTo(id as PageId);
    },
    [startFocus, navigateTo, openStats, openCalendar, openPlanning],
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

  const handlePaletteCreateTask = useCallback(
    async (title: string, date: Date) => {
      closePalette();
      const dayKey = toDayKey(date);
      try {
        const existing = await listTasks();
        let created = await createTask({ title, kind: 'custom' });
        const start = resolveScheduleStart(dayKey, existing, date);
        created = await scheduleTask(created.id, start, 30);
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
      } catch (err) {
        captureOperationError(err);
      }
    },
    [captureOperationError, closePalette],
  );

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
    calendarOpen: page === 'calendar',
    planningOpen: page === 'planning',
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
          case 'home':
            return <HomePage />;
          case 'today':
            return (
              <TaskBoardPage
                openRequest={taskOpenRequest}
                onConsumeOpenRequest={consumeTaskOpenRequest}
              />
            );
          case 'notes':
            return (
              <NotesPage
                openRequest={noteOpenRequest}
                onConsumeOpenRequest={consumeNoteOpenRequest}
                onRegisterFlush={registerNotesFlush}
              />
            );
          case 'whiteboard':
            return <WhiteboardPage boardCanvas={boardCanvas} />;
          case 'calendar':
            return <CalendarPage onClose={() => navigateTo('home')} />;
          case 'planning':
            return <DailyPlanningPage onClose={() => navigateTo('home')} />;
          case 'settings':
            return (
              <SettingsPage
                theme={theme}
                onThemeChange={setTheme}
                boardCanvas={boardCanvas}
                onBoardCanvasChange={setBoardCanvas}
                onPomoChange={(secs) => usePomodoroStore.getState().setDurationSec(secs)}
                onTimerModeChange={(mode) => usePomodoroStore.getState().setMode(mode)}
                onBack={() => navigateTo('home')}
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
      registerNotesFlush,
    ],
  );

  const posterBoost = statsOpen || paletteMounted;

  if (operationError) throw operationError;

  const renderScreen = (screenId: string): JSX.Element => {
    if (screenId === 'loading') {
      return (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', color: 'var(--ink-40)', display: 'grid', placeItems: 'center', fontSize: 13 }}>
          {translate('nordly.app.loading')}
        </div>
      );
    }

    if (screenId === 'guest') {
      return (
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', background: 'var(--bg)' }}>
          <TitlebarDrag />
          <CanvasBg mode="full" theme={theme} />
          <div style={{ position: 'relative', zIndex: 2, height: '100%' }}>
            <LoginScreen />
          </div>
        </div>
      );
    }

    // ScreenFade keeps the signed-in layer mounted briefly during logout crossfade.
    if (status !== 'signed_in' || !userId) {
      return <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)' }} aria-hidden />;
    }

    const signedInShell = (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden' }}>
        <div
          className="nordly-canvas-shell"
          data-visible={page === 'home' ? 'true' : 'false'}
          data-boost={posterBoost ? 'true' : 'false'}
        >
          <CanvasBg
            mode={page === 'home' ? 'full' : 'quiet'}
            theme={theme}
            boost={posterBoost}
          />
        </div>

        <TitlebarDrag />

        <SyncStatusBanner />

        {reauthOpen && sessionReauthRequired ? (
          <ReauthLoginOverlay onClose={() => setReauthOpen(false)} />
        ) : null}

        <TrafficLightsHover />
        <div className="nordly-chrome-shell" data-visible={page === 'home' ? 'true' : 'false'}>
          <Wordmark />
          <AppVersionBadge />
        </div>

        {page === 'home' ? (
          <Suspense fallback={null}>
            <HomeTodayTasks />
          </Suspense>
        ) : null}

        <PageStack page={page}>{renderPage}</PageStack>

        {page === 'home' && <AnimatedStatsOverlay open={statsOpen} onClose={closeStats} />}

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

  const sessionReady = status === 'signed_in' && userId != null;
  const screen = status === 'unknown' ? 'loading' : sessionReady ? 'app' : 'guest';

  return <ScreenFade screen={screen}>{renderScreen}</ScreenFade>;
}
