import { useCallback, useEffect, useRef, useState } from 'react';

import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useT } from '@nordly-i18n';

import { Icon } from '@shared/ui/primitives/Icon';
import { NOTIFY_AUTO_DISMISS_MS } from '@shared/api/notifications';
import { applyTheme } from '@shared/lib/applyTheme';
import { readStoredTheme } from '@shared/model/theme';
import type { ThemeId } from '@shared/model/theme';

interface NotificationPayload {
  title: string;
  body: string;
}

const SWIPE_DISMISS_PX = 72;
const CLOSE_ANIM_MS = 320;

export function NotificationOverlayApp(): JSX.Element {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const [swipeOut, setSwipeOut] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [payload, setPayload] = useState<NotificationPayload>({ title: '', body: '' });

  const dismissTimerRef = useRef<number | undefined>(undefined);
  const dragRef = useRef({ startX: 0, offsetX: 0, moved: false });

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current !== undefined) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = undefined;
    }
  }, []);

  const requestDismiss = useCallback(() => {
    clearDismissTimer();
    void invoke('hide_notification').catch(() => undefined);
  }, [clearDismissTimer]);

  const scheduleAutoDismiss = useCallback(() => {
    clearDismissTimer();
    dismissTimerRef.current = window.setTimeout(() => {
      requestDismiss();
    }, NOTIFY_AUTO_DISMISS_MS);
  }, [clearDismissTimer, requestDismiss]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    void listen<NotificationPayload>('notification:show', (event) => {
      applyTheme(readStoredTheme());
      setPayload(event.payload);
      setClosing(false);
      setSwipeOut(false);
      setDragX(0);
      setDragging(false);
      dragRef.current = { startX: 0, offsetX: 0, moved: false };
      setVisible(true);
      scheduleAutoDismiss();
    }).then((off) => unsubs.push(off));

    void listen('notification:hide', () => {
      clearDismissTimer();
      setClosing(true);
      window.setTimeout(() => {
        setVisible(false);
        setClosing(false);
        setSwipeOut(false);
        setDragX(0);
        setDragging(false);
      }, CLOSE_ANIM_MS);
    }).then((off) => unsubs.push(off));

    void listen<ThemeId>('theme:sync', ({ payload }) => {
      applyTheme(payload);
    }).then((off) => unsubs.push(off));

    return () => {
      clearDismissTimer();
      for (const off of unsubs) off();
    };
  }, [clearDismissTimer, scheduleAutoDismiss]);

  const openApp = () => {
    if (dragRef.current.moved) return;
    void invoke('focus_main_window').catch(() => undefined);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (closing) return;
    dragRef.current = { startX: event.clientX, offsetX: 0, moved: false };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragging || closing) return;
    const dx = Math.max(0, event.clientX - dragRef.current.startX);
    dragRef.current.offsetX = dx;
    if (dx > 6) dragRef.current.moved = true;
    setDragX(dx);
  };

  const finishDrag = () => {
    if (!dragging || closing) return;
    setDragging(false);

    const dx = dragRef.current.offsetX;
    if (dx >= SWIPE_DISMISS_PX) {
      setSwipeOut(true);
      setClosing(true);
      window.setTimeout(() => requestDismiss(), 220);
      return;
    }

    setDragX(0);
    dragRef.current = { startX: 0, offsetX: 0, moved: false };
  };

  const dragStyle =
    dragX > 0 && !swipeOut
      ? {
          transform: `translateX(${dragX}px) scale(1)`,
          opacity: Math.max(0.4, 1 - dragX / 260),
        }
      : undefined;

  return (
    <div className="nordly-notification-shell">
      <div
        className={[
          'nordly-notification',
          visible ? 'is-visible' : '',
          closing ? 'is-closing' : '',
          swipeOut ? 'is-swipe-out' : '',
          dragging ? 'is-dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={dragStyle}
        data-visible={visible ? 'true' : undefined}
        aria-live="polite"
      >
        <button
          type="button"
          className="nordly-notification__close focus-ring"
          aria-label={t('nordly.sync.banner_dismiss')}
          onClick={(event) => {
            event.stopPropagation();
            requestDismiss();
          }}
        >
          ×
        </button>
        <button
          type="button"
          className="nordly-notification__main focus-ring"
          onClick={openApp}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
        >
          <span className="nordly-notification__icon" aria-hidden>
            <Icon name="pomodoro" size={18} strokeWidth={2} />
          </span>
          <span className="nordly-notification__copy">
            <span className="nordly-notification__app">Nordly</span>
            <span className="nordly-notification__title">{payload.title}</span>
            {payload.body ? (
              <span className="nordly-notification__body">{payload.body}</span>
            ) : null}
          </span>
        </button>
      </div>
    </div>
  );
}
