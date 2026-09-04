import { useEffect, useRef, useState } from 'react';

import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import {
  loadNotesEditorZoom,
  saveNotesEditorZoom,
  NOTES_ZOOM_DEFAULT,
  stepNotesEditorZoom,
} from '@features/notes/lib/notesEditorZoom';
import { SIDEBAR_COLLAPSED_KEY } from './utils';

const SIDEBAR_RESIZE_SETTLE_MS = 80;

export function useNotesSidebarChrome(): {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  editorZoom: number;
  setEditorZoom: React.Dispatch<React.SetStateAction<number>>;
} {
  const [editorZoom, setEditorZoom] = useState(loadNotesEditorZoom);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (err) {
      console.warn('[nordly:notes] sidebar collapse load failed', err);
      return false;
    }
  });
  const sidebarMountedRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
    } catch (err) {
      console.warn('[nordly:notes] sidebar collapse persist failed', err);
    }
    if (!sidebarMountedRef.current) {
      sidebarMountedRef.current = true;
      return;
    }
    const t1 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    const t2 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), SIDEBAR_RESIZE_SETTLE_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onToggle = () => setSidebarCollapsed((c) => !c);
    window.addEventListener(NORDLY_EVENTS.toggleSidebar, onToggle as EventListener);
    return () => window.removeEventListener(NORDLY_EVENTS.toggleSidebar, onToggle as EventListener);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey) return;
      const zoomIn = e.key === '=' || e.key === '+' || e.code === 'NumpadAdd';
      const zoomOut = e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract';
      const zoomReset = e.key === '0' || e.code === 'Numpad0';
      if (!zoomIn && !zoomOut && !zoomReset) return;
      e.preventDefault();
      setEditorZoom((prev) => {
        const next = zoomReset
          ? NOTES_ZOOM_DEFAULT
          : stepNotesEditorZoom(prev, zoomIn ? 1 : -1);
        saveNotesEditorZoom(next);
        return next;
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return { sidebarCollapsed, setSidebarCollapsed, editorZoom, setEditorZoom };
}
