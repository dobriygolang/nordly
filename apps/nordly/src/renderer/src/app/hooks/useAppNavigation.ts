import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type EntityNavigationRequest,
  PageId,
  isPageId,
} from '@shared/model/navigation';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { STORAGE_KEYS } from '@shared/lib/storage-keys';

export const PAGE_STORAGE_KEY = STORAGE_KEYS.lastPage;

interface PageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const FLUSH_ON_LEAVE = new Set<PageId>([
  PageId.Notes,
  PageId.Whiteboard,
  PageId.Calendar,
  PageId.Planning,
]);

export function readStoredPage(storage?: PageStorage): PageId {
  if (!storage) return PageId.Home;
  let value: string | null;
  try {
    value = storage.getItem(PAGE_STORAGE_KEY);
  } catch (err) {
    console.warn('[navigation] session page read failed', err);
    return PageId.Home;
  }
  if (value === null) return PageId.Home;
  if (isPageId(value)) return value;
  throw new Error(`Invalid stored page: ${value}`);
}

export function shouldFlushBeforeNavigation(current: PageId, target: PageId): boolean {
  return FLUSH_ON_LEAVE.has(current) && current !== target;
}

export interface AppNavigation {
  page: PageId;
  statsOpen: boolean;
  taskOpenRequest: EntityNavigationRequest | null;
  noteOpenRequest: EntityNavigationRequest | null;
  navigateTo: (page: PageId) => Promise<boolean>;
  goHome: () => Promise<boolean>;
  openStats: () => Promise<boolean>;
  closeStats: () => void;
  openCalendar: () => Promise<boolean>;
  closeCalendar: () => Promise<boolean>;
  openPlanning: () => Promise<boolean>;
  closePlanning: () => Promise<boolean>;
  openTaskRequest: (id: string) => Promise<boolean>;
  openNoteRequest: (id: string) => Promise<boolean>;
  consumeTaskOpenRequest: (requestKey: number) => void;
  consumeNoteOpenRequest: (requestKey: number) => void;
  registerPageFlush: (flush: (() => Promise<boolean>) | null) => void;
}

export function useAppNavigation(
  onError: (error: unknown) => void = (error) => {
    console.error('[nordly:navigation]', error);
  },
): AppNavigation {
  const storage = typeof window === 'undefined' ? undefined : window.sessionStorage;
  const [page, setPageRaw] = useState<PageId>(() => readStoredPage(storage));
  const [statsOpen, setStatsOpen] = useState(false);
  const [taskOpenRequest, setTaskOpenRequest] =
    useState<EntityNavigationRequest | null>(null);
  const [noteOpenRequest, setNoteOpenRequest] =
    useState<EntityNavigationRequest | null>(null);
  const pageRef = useRef(page);
  const entityRequestKeyRef = useRef(0);
  const pageFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const navSeqRef = useRef(0);
  pageRef.current = page;

  const setPage = useCallback((next: PageId) => {
    setPageRaw(next);
    try {
      window.sessionStorage.setItem(PAGE_STORAGE_KEY, next);
    } catch (err) {
      console.warn('[navigation] session page persist failed', err);
    }
  }, []);

  const beforeNavigate = useCallback(async (target: PageId): Promise<boolean> => {
    if (!shouldFlushBeforeNavigation(pageRef.current, target)) return true;
    const flush = pageFlushRef.current;
    if (!flush) {
      console.error('[nav] page flush required but not registered');
      return false;
    }
    return flush();
  }, []);

  const commitNavigation = useCallback(
    async (next: PageId, after?: () => void): Promise<boolean> => {
      const seq = ++navSeqRef.current;
      if (!(await beforeNavigate(next))) return false;
      if (seq !== navSeqRef.current) return false;
      setStatsOpen(false);
      setPage(next);
      after?.();
      return true;
    },
    [setPage, beforeNavigate],
  );

  const navigateTo = useCallback(
    (next: PageId): Promise<boolean> => commitNavigation(next),
    [commitNavigation],
  );

  const goHome = useCallback(() => navigateTo(PageId.Home), [navigateTo]);
  const openStats = useCallback(
    () => commitNavigation(PageId.Home, () => setStatsOpen(true)),
    [commitNavigation],
  );
  const closeStats = useCallback(() => setStatsOpen(false), []);
  const openCalendar = useCallback(() => navigateTo(PageId.Calendar), [navigateTo]);
  const closeCalendar = useCallback(() => navigateTo(PageId.Home), [navigateTo]);
  const openPlanning = useCallback(() => navigateTo(PageId.Planning), [navigateTo]);
  const closePlanning = useCallback(() => navigateTo(PageId.Home), [navigateTo]);

  const openTaskRequest = useCallback(
    (id: string): Promise<boolean> => {
      const request = { id, requestKey: ++entityRequestKeyRef.current };
      return commitNavigation(PageId.Today, () => setTaskOpenRequest(request));
    },
    [commitNavigation],
  );

  const openNoteRequest = useCallback(
    (id: string): Promise<boolean> => {
      const request = { id, requestKey: ++entityRequestKeyRef.current };
      return commitNavigation(PageId.Notes, () => setNoteOpenRequest(request));
    },
    [commitNavigation],
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

  const registerPageFlush = useCallback((flush: (() => Promise<boolean>) | null) => {
    pageFlushRef.current = flush;
  }, []);

  useEffect(() => {
    const onNavTask = (event: Event): void => {
      const taskId = (event as CustomEvent<{ taskId?: string }>).detail?.taskId;
      if (taskId) void openTaskRequest(taskId).catch(onError);
    };
    const onNavHome = (): void => {
      void goHome().catch(onError);
    };
    const onOpenPlanning = (): void => {
      void openPlanning().catch(onError);
    };
    const onOpenSettings = (): void => {
      void navigateTo(PageId.Settings).catch(onError);
    };

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
  }, [goHome, navigateTo, onError, openPlanning, openTaskRequest]);

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
    registerPageFlush,
  };
}
