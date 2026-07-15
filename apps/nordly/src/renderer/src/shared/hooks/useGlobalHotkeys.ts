// useGlobalHotkeys — global keyboard listener for Nordly hotkeys.
import { useEffect, useRef } from 'react';

import type { PageId } from '@shared/model/navigation';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { dismissTopEscapeLayer } from '@shared/lib/escapeLayer';

interface GlobalHotkeysDeps {
  page: PageId;
  paletteOpen: boolean;
  statsOpen: boolean;
  calendarOpen: boolean;
  planningOpen: boolean;
  setPaletteOpen: (next: (p: boolean) => boolean) => void;
  goHome: () => void;
  openStats: () => void;
  closeStats: () => void;
  openCalendar: () => void;
  closeCalendar: () => void;
  openPlanning: () => void;
  closePlanning: () => void;
  open: (id: PageId) => void;
}

const LETTER_HOTKEYS: Record<string, PageId> = {
  KeyT: 'today',
  KeyN: 'notes',
  KeyB: 'whiteboard',
  KeyC: 'calendar',
  Comma: 'settings',
};

export function useGlobalHotkeys(deps: GlobalHotkeysDeps): void {
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = depsRef.current;
      const isMod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const isText =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        d.setPaletteOpen((p) => !p);
        return;
      }
      if (isMod && e.key.toLowerCase() === 's' && !e.shiftKey && !isText) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.toggleSidebar));
        return;
      }

      if (e.key === 'Escape') {
        // Capture phase: beat CodeMirror / nested listeners so layers dismiss
        // before page-level goHome.
        if (dismissTopEscapeLayer()) {
          e.preventDefault();
          e.stopImmediatePropagation();
          return;
        }
        if (d.paletteOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          d.setPaletteOpen(() => false);
          return;
        }
        if (d.planningOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          d.closePlanning();
          return;
        }
        if (d.calendarOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          d.closeCalendar();
          return;
        }
        if (d.statsOpen) {
          e.preventDefault();
          e.stopImmediatePropagation();
          d.closeStats();
          return;
        }
        if (d.page !== 'home') {
          e.preventDefault();
          d.goHome();
        }
        return;
      }

      if (isText || d.paletteOpen) return;
      if (isMod || e.altKey) return;

      if (e.code === 'KeyS') {
        if (d.statsOpen) d.closeStats();
        else d.openStats();
        return;
      }

      if (e.code === 'KeyC') {
        if (d.calendarOpen) d.closeCalendar();
        else d.openCalendar();
        return;
      }

      if (e.code === 'KeyP') {
        if (d.planningOpen) d.closePlanning();
        else d.openPlanning();
        return;
      }

      const id = LETTER_HOTKEYS[e.code];
      if (!id) return;
      if (id === 'calendar') {
        if (d.calendarOpen) d.closeCalendar();
        else d.openCalendar();
        return;
      }
      if (d.page === id) d.goHome();
      else d.open(id);
    };
    // Escape must listen in capture so modal layers win over goHome and editors.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
}
