import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';

import { emit, listen } from '@tauri-apps/api/event';

import { translate } from '@nordly-i18n';

import { CanvasBg, type ThemeId } from '@widgets/CanvasBg';
import { Wordmark, AppVersionBadge } from '@widgets/Chrome';
import { TitlebarDrag } from '@widgets/TitlebarDrag';
import { TrafficLightsHover } from '@widgets/TrafficLightsHover';
import { Dock } from '@widgets/Dock';
import { LoginScreen } from '@widgets/LoginScreen';
import { AnimatedStatsOverlay } from '@widgets/AnimatedStatsOverlay';
import { AnimatedCalendarOverlay } from '@widgets/AnimatedCalendarOverlay';
import { AnimatedDailyPlanningOverlay } from '@widgets/AnimatedDailyPlanningOverlay';
import { HomeTodayTasks } from '@widgets/HomeTodayTasks';
import { PomodoroController } from '@widgets/PomodoroController';
import { type PageId, type PaletteAction } from '@widgets/Palette';
import { VaultUnlockGate } from '@widgets/VaultUnlockGate';
import { createTask, listTasks, scheduleTask } from '@features/tasks/api/tasks';
import {
  parseDayKey,
  resolveScheduleStart,
  toDayKey,
} from '@pages/TaskBoard/lib/dates';
import { HomePage } from '@pages/Home';
import { readStoredTheme } from '@shared/model/prefs';
import { readSettings } from '@pages/Settings/lib/settings-store';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import { applyTheme } from '@shared/lib/applyTheme';
import { initPomodoroLeader } from '@features/focus/lib/pomodoroCrossWindow';
import { usePomodoroStore, type PomodoroStartArgs } from '@shared/model/pomodoro';
import { useSessionStore } from '@shared/model/session';
import { PageStack } from '@shared/ui/PageStack';
import { ScreenFade } from '@shared/ui/ScreenFade';
import { useGlobalHotkeys } from '@shared/hooks/useGlobalHotkeys';
import { LOCAL_ONLY } from '@app/config/features';
import { migrateLocalStorageIfNeeded } from '@shared/sync/migrateLocalStorage';
import { startSyncEngine, stopSyncEngine } from '@shared/sync/SyncEngine';
import {
  startGoogleCalendarSyncWorker,
  stopGoogleCalendarSyncWorker,
} from '@features/calendar/lib/googleCalendarSyncWorker';
import { loadVaultPrefs, isVaultEnabledSync } from '@shared/crypto/vaultPrefs';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

const TaskBoardPage = lazy(() => import('@pages/TaskBoard').then((m) => ({ default: m.TaskBoardPage })));
const NotesPage = lazy(() => import('@pages/Notes').then((m) => ({ default: m.NotesPage })));
const SettingsPage = lazy(() => import('@pages/Settings').then((m) => ({ default: m.SettingsPage })));
const WhiteboardPage = lazy(() =>
  import('@pages/Whiteboard').then((m) => ({ default: m.WhiteboardPage })),
);
const Palette = lazy(() =>
  import('@widgets/Palette').then((m) => ({ default: m.Palette })),
);

/** Must match palette close transition in globals.css (`--motion-dur-medium`). */
const PALETTE_CLOSE_MS = 320;

function preloadPalettePages(): void {
  void import('@pages/TaskBoard');
  void import('@pages/DailyPlanning/DailyPlanningModal');
  void import('@pages/Notes');
  void import('@pages/Settings');
  void import('@pages/Whiteboard');
}

type StartFocusArgs = PomodoroStartArgs;

const NAV_PAGES = new Set<PageId>(['home', 'today', 'notes', 'whiteboard', 'settings']);

export default function App() {
  const status = useSessionStore((s) => s.status);
  const userId = useSessionStore((s) => s.userId);
  const bootstrap = useSessionStore((s) => s.bootstrap);
  const hydrate = useSessionStore((s) => s.hydrate);
  const clear = useSessionStore((s) => s.clear);

  const PAGE_STORAGE_KEY = 'nordly:lastPage:v1';
  const readStoredPage = (): PageId => {
    if (typeof window === 'undefined') return 'home';
    try {
      const v = window.sessionStorage.getItem(PAGE_STORAGE_KEY);
      if (v === 'stats') return 'home';
      if (v && NAV_PAGES.has(v as PageId)) return v as PageId;
    } catch {
      /* sessionStorage may be unavailable */
    }
    return 'home';
  };

  const [page, setPageRaw] = useState<PageId>(() => readStoredPage());
  const [statsOpen, setStatsOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.sessionStorage.getItem(PAGE_STORAGE_KEY) === 'stats';
    } catch {
      return false;
    }
  });
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);

  const setPage = useCallback((next: PageId | ((p: PageId) => PageId)) => {
    setPageRaw((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      try {
        window.sessionStorage.setItem(PAGE_STORAGE_KEY, resolved);
      } catch {
        /* ignore */
      }
      return resolved;
    });
  }, []);

  const navigateTo = useCallback(
    (id: PageId) => {
      if (id === page) return;
      setStatsOpen(false);
      setCalendarOpen(false);
      setPlanningOpen(false);
      setPage(id);
    },
    [page, setPage],
  );

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMounted, setPaletteMounted] = useState(false);
  const [paletteClosing, setPaletteClosing] = useState(false);
  const [paletteTaskDate, setPaletteTaskDate] = useState<Date | null>(null);
  const [theme, setTheme] = useState<ThemeId>(() => readStoredTheme());
  const [boardCanvas, setBoardCanvas] = useState<BoardCanvasTheme>(
    () => readSettings().boardCanvas,
  );
  const [vaultGateActive, setVaultGateActive] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      void emit('theme:sync', theme);
    }
  }, [theme]);

  useEffect(() => initPomodoroLeader(), []);

  useEffect(() => {
    if (status !== 'signed_in') return;
    const { accessToken, expiresAt } = useSessionStore.getState();
    if (!accessToken || (expiresAt > 0 && Date.now() > expiresAt)) {
      void clear();
    }
  }, [status, clear]);

  useEffect(() => {
    void bootstrap();
    const bridge = typeof window !== 'undefined' ? window.nordly : undefined;
    if (!bridge) return;

    const offAuth = bridge.on('authChanged', (session) => {
      if (session) {
        hydrate({
          userId: session.userId,
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresAt: session.expiresAt,
        });
      } else {
        void clear();
      }
    });

    const handleDeepLink = (url: string) => {
      try {
        const u = new URL(url);
        const host = u.host.toLowerCase();
        if (host === 'focus' || host === 'focus.start') {
          usePomodoroStore.getState().start({
            planItemId: u.searchParams.get('task') ?? undefined,
            pinnedTitle: u.searchParams.get('title') ?? undefined,
          });
          navigateTo('home');
          return;
        }
        if (host === 'task.open') {
          const taskId = u.searchParams.get('id') ?? u.searchParams.get('task');
          if (taskId) {
            setStatsOpen(false);
            navigateTo('today');
            window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.openTask, { detail: { taskId } }));
          }
          return;
        }
        if (host === 'note.open') {
          const noteId = u.searchParams.get('id') ?? u.searchParams.get('note');
          if (noteId) {
            setStatsOpen(false);
            navigateTo('notes');
            window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.openNote, { detail: { noteId } }));
          }
          return;
        }
        if (host === 'settings') {
          const calStatus = u.searchParams.get('google_calendar');
          if (calStatus) {
            window.dispatchEvent(
              new CustomEvent(NORDLY_EVENTS.googleCalendarOAuth, {
                detail: { status: calStatus, detail: u.searchParams.get('detail') },
              }),
            );
          }
          const zoomStatus = u.searchParams.get('zoom');
          if (zoomStatus) {
            window.dispatchEvent(
              new CustomEvent(NORDLY_EVENTS.zoomOAuth, {
                detail: { status: zoomStatus, detail: u.searchParams.get('detail') },
              }),
            );
          }
          navigateTo('settings');
        }
      } catch {
        /* ignore malformed */
      }
    };

    const offDeep = bridge.on('deepLink', ({ url }) => handleDeepLink(url));

    // Cold start: the OAuth redirect may have launched the app before this
    // listener attached, so pull any launch URL and process it once.
    void window.nordly?.deepLink?.initial?.().then((url) => {
      if (url) handleDeepLink(url);
    });

    return () => {
      offAuth();
      offDeep();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'signed_in' || !userId) {
      stopSyncEngine();
      stopGoogleCalendarSyncWorker();
      return;
    }
    let cancelled = false;
    void (async () => {
      await migrateLocalStorageIfNeeded(userId);
      await loadVaultPrefs(userId);
      if (cancelled) return;
      setVaultGateActive(!LOCAL_ONLY && isVaultEnabledSync());
      if (!LOCAL_ONLY) {
        startSyncEngine();
        startGoogleCalendarSyncWorker();
      }
    })();
    return () => {
      cancelled = true;
      stopSyncEngine();
      stopGoogleCalendarSyncWorker();
    };
  }, [status, userId]);

  useEffect(() => {
    if (status !== 'signed_in') return;
    void import('@shared/api/device').then(({ ensureDevice }) => {
      void ensureDevice({ appVersion: '0.0.1' }).catch(() => {
        /* silent */
      });
    });
  }, [status]);

  useEffect(() => {
    if (status !== 'signed_in') return;
    void import('@pages/TaskBoard');
    void import('@pages/Notes');
    void import('@pages/Settings');
    void import('@pages/Whiteboard');
    void import('@widgets/Palette');
    void import('@pages/Calendar/CalendarModal');
    void import('@widgets/StatsOverlayCards');
  }, [status]);

  const startFocus = useCallback(
    (args?: StartFocusArgs) => {
      usePomodoroStore.getState().start(args);
      navigateTo('home');
    },
    [navigateTo],
  );

  const openStats = useCallback(() => {
    setCalendarOpen(false);
    setPlanningOpen(false);
    navigateTo('home');
    setStatsOpen(true);
  }, [navigateTo]);

  const closeStats = useCallback(() => {
    setStatsOpen(false);
  }, []);

  const openCalendar = useCallback(() => {
    setStatsOpen(false);
    setPlanningOpen(false);
    setCalendarOpen(true);
  }, []);

  const closeCalendar = useCallback(() => {
    setCalendarOpen(false);
  }, []);

  const openPlanning = useCallback(() => {
    setStatsOpen(false);
    setCalendarOpen(false);
    setPlanningOpen(true);
  }, []);

  const closePlanning = useCallback(() => {
    setPlanningOpen(false);
  }, []);

  const completePlanning = useCallback(() => {
    setPlanningOpen(false);
    navigateTo('home');
  }, [navigateTo]);

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
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    let unlisten: (() => void) | undefined;
    void listen('app:open-palette', () => {
      openPalette();
    }).then((off) => {
      unlisten = off;
    });
    return () => {
      unlisten?.();
    };
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
        let created = await createTask({ title });
        const start = resolveScheduleStart(dayKey, existing, date);
        created = await scheduleTask(created.id, start, 30);
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged));
        if (!planningOpen) navigateTo('today');
      } catch {
        /* silent */
      }
    },
    [closePalette, navigateTo, planningOpen],
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

  const goHome = useCallback(() => {
    setStatsOpen(false);
    setCalendarOpen(false);
    navigateTo('home');
  }, [navigateTo]);

  useEffect(() => {
    const onNavTask = (e: Event) => {
      const taskId = (e as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (!taskId) return;
      setCalendarOpen(false);
      setStatsOpen(false);
      navigateTo('today');
      window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.openTask, { detail: { taskId } }));
    };
    window.addEventListener(NORDLY_EVENTS.navOpenTask, onNavTask);
    return () => window.removeEventListener(NORDLY_EVENTS.navOpenTask, onNavTask);
  }, [navigateTo]);

  useEffect(() => {
    const onNavHome = () => goHome();
    window.addEventListener(NORDLY_EVENTS.navHome, onNavHome);
    return () => window.removeEventListener(NORDLY_EVENTS.navHome, onNavHome);
  }, [goHome]);

  useEffect(() => {
    const onOpenPlanning = () => openPlanning();
    window.addEventListener(NORDLY_EVENTS.openPlanning, onOpenPlanning);
    return () => window.removeEventListener(NORDLY_EVENTS.openPlanning, onOpenPlanning);
  }, [openPlanning]);

  useEffect(() => {
    if (status === 'unknown') return;
    preloadPalettePages();
  }, [status]);

  useEffect(() => {
    const onOpenSettings = () => navigateTo('settings');
    window.addEventListener(NORDLY_EVENTS.openSettings, onOpenSettings);
    return () => window.removeEventListener(NORDLY_EVENTS.openSettings, onOpenSettings);
  }, [navigateTo]);

  useGlobalHotkeys({
    page,
    paletteOpen,
    statsOpen,
    calendarOpen,
    planningOpen,
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
            return <TaskBoardPage />;
          case 'notes':
            return <NotesPage />;
          case 'whiteboard':
            return <WhiteboardPage boardCanvas={boardCanvas} />;
          case 'settings':
            return (
              <SettingsPage
                theme={theme}
                onThemeChange={setTheme}
                boardCanvas={boardCanvas}
                onBoardCanvasChange={setBoardCanvas}
                onPomoChange={(secs) => usePomodoroStore.getState().setDurationSec(secs)}
              />
            );
          default:
            return null;
        }
      },
    [theme, boardCanvas],
  );

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

    const signedInShell = (
      <div style={{ position: 'fixed', inset: 0, background: 'var(--bg)', overflow: 'hidden' }}>
        <div className="nordly-canvas-shell" data-visible={page === 'home' ? 'true' : 'false'}>
          <CanvasBg mode={page === 'home' ? 'full' : 'void'} theme={theme} />
        </div>

        <TitlebarDrag />

        <TrafficLightsHover />
        <div className="nordly-chrome-shell" data-visible={page === 'home' ? 'true' : 'false'}>
          <Wordmark />
          <AppVersionBadge />
        </div>

        {page === 'home' ? <HomeTodayTasks /> : null}

        <PageStack page={page}>{renderPage}</PageStack>

        {page === 'home' && <AnimatedStatsOverlay open={statsOpen} onClose={closeStats} />}
        <AnimatedCalendarOverlay open={calendarOpen} onClose={closeCalendar} />
        <AnimatedDailyPlanningOverlay
          open={planningOpen}
          onClose={closePlanning}
          onComplete={completePlanning}
        />

        <PomodoroController />

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

  const screen = status === 'unknown' ? 'loading' : status === 'guest' ? 'guest' : 'app';

  return <ScreenFade screen={screen}>{renderScreen}</ScreenFade>;
}
