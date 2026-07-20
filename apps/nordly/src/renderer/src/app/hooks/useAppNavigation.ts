import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type EntityNavigationRequest,
  type PageId,
  isPageId,
} from '@shared/model/navigation';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

export const PAGE_STORAGE_KEY = 'nordly:lastPage:v1';

interface PageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredPage(storage?: PageStorage): PageId {
  if (!storage) return 'home';
  const value = storage.getItem(PAGE_STORAGE_KEY);
  if (value === null) return 'home';
  if (isPageId(value)) return value;
  throw new Error(`Invalid stored page: ${value}`);
}

export function shouldFlushBeforeNavigation(current: PageId, target: PageId): boolean {
  return current === 'notes' && target !== 'notes';
}

export interface AppNavigation {
  page: PageId;
  statsOpen: boolean;
  taskOpenRequest: EntityNavigationRequest | null;
  noteOpenRequest: EntityNavigationRequest | null;
  navigateTo: (page: PageId) => void;
  goHome: () => void;
  openStats: () => void;
  closeStats: () => void;
  openCalendar: () => void;
  closeCalendar: () => void;
  openPlanning: () => void;
  closePlanning: () => void;
  openTaskRequest: (id: string) => void;
  openNoteRequest: (id: string) => void;
  consumeTaskOpenRequest: (requestKey: number) => void;
  consumeNoteOpenRequest: (requestKey: number) => void;
  registerNotesFlush: (flush: (() => Promise<boolean>) | null) => void;
  beforeNavigate: (target: PageId) => Promise<boolean>;
}

export function useAppNavigation(): AppNavigation {
  const storage = typeof window === 'undefined' ? undefined : window.sessionStorage;
  const [page, setPageRaw] = useState<PageId>(() => readStoredPage(storage));
  const [statsOpen, setStatsOpen] = useState(
    () => storage?.getItem(PAGE_STORAGE_KEY) === 'stats',
  );
  const [taskOpenRequest, setTaskOpenRequest] =
    useState<EntityNavigationRequest | null>(null);
  const [noteOpenRequest, setNoteOpenRequest] =
    useState<EntityNavigationRequest | null>(null);
  const pageRef = useRef(page);
  const entityRequestKeyRef = useRef(0);
  const notesFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  pageRef.current = page;

  const setPage = useCallback((next: PageId) => {
    setPageRaw(next);
    window.sessionStorage.setItem(PAGE_STORAGE_KEY, next);
  }, []);

  const navigateTo = useCallback(
    (next: PageId) => {
      setStatsOpen(false);
      setPage(next);
    },
    [setPage],
  );

  const goHome = useCallback(() => navigateTo('home'), [navigateTo]);
  const openStats = useCallback(() => {
    navigateTo('home');
    setStatsOpen(true);
  }, [navigateTo]);
  const closeStats = useCallback(() => setStatsOpen(false), []);
  const openCalendar = useCallback(() => navigateTo('calendar'), [navigateTo]);
  const closeCalendar = useCallback(() => navigateTo('home'), [navigateTo]);
  const openPlanning = useCallback(() => navigateTo('planning'), [navigateTo]);
  const closePlanning = useCallback(() => navigateTo('home'), [navigateTo]);

  const openTaskRequest = useCallback(
    (id: string) => {
      setTaskOpenRequest({ id, requestKey: ++entityRequestKeyRef.current });
      navigateTo('today');
    },
    [navigateTo],
  );

  const openNoteRequest = useCallback(
    (id: string) => {
      setNoteOpenRequest({ id, requestKey: ++entityRequestKeyRef.current });
      navigateTo('notes');
    },
    [navigateTo],
  );

  const consumeTaskOpenRequest = useCallback((requestKey: number) => {
    setTaskOpenRequest((current) =>
      current?.requestKey === requestKey ? null : current,
    );
  }, []);

  const consumeNoteOpenRequest = useCallback((requestKey: number) => {
    setNoteOpenRequest((current) =>
      current?.requestKey === requestKey ? null : current,
    );
  }, []);

  const registerNotesFlush = useCallback((flush: (() => Promise<boolean>) | null) => {
    notesFlushRef.current = flush;
  }, []);

  const beforeNavigate = useCallback(async (target: PageId): Promise<boolean> => {
    if (!shouldFlushBeforeNavigation(pageRef.current, target)) return true;
    const flush = notesFlushRef.current;
    if (!flush) {
      console.error('[nav] notes flush required but not registered');
      return false;
    }
    return flush();
  }, []);

  useEffect(() => {
    const onNavTask = (event: Event): void => {
      const taskId = (event as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (taskId) openTaskRequest(taskId);
    };
    const onNavHome = (): void => goHome();
    const onOpenPlanning = (): void => openPlanning();
    const onOpenSettings = (): void => navigateTo('settings');

    window.addEventListener(NORDLY_EVENTS.navOpenTask, onNavTask);
    window.addEventListener(NORDLY_EVENTS.navHome, onNavHome);
    window.addEventListener(NORDLY_EVENTS.openPlanning, onOpenPlanning);
    window.addEventListener(NORDLY_EVENTS.openSettings, onOpenSettings);
    return () => {
      window.removeEventListener(NORDLY_EVENTS.navOpenTask, onNavTask);
      window.removeEventListener(NORDLY_EVENTS.navHome, onNavHome);
      window.removeEventListener(NORDLY_EVENTS.openPlanning, onOpenPlanning);
      window.removeEventListener(NORDLY_EVENTS.openSettings, onOpenSettings);
    };
  }, [goHome, navigateTo, openPlanning, openTaskRequest]);

  return {
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
  };
}
