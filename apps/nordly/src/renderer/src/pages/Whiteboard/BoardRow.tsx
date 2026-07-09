import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '@nordly-i18n';

import type { BoardSummary } from '@features/whiteboard/api/whiteboardClient';
import { Icon } from '@shared/ui/primitives/Icon';
import { noteMenuPos } from '@shared/lib/noteMenuPos';
import { useVaultRowMenuDismiss } from '@shared/lib/useVaultRowMenuDismiss';

const MENU_W = 168;

export interface BoardRowProps {
  board: BoardSummary;
  active: boolean;
  cloudEnabled: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onShare?: () => void;
  onPublish?: () => void;
  onDelete: (id: string) => Promise<void>;
}

export const BoardRow = memo(function BoardRow({
  board,
  active,
  cloudEnabled,
  menuOpen,
  onMenuOpenChange,
  onSelect,
  onShare,
  onPublish,
  onDelete,
}: BoardRowProps) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const closeMenu = useCallback(() => onMenuOpenChange(false), [onMenuOpenChange]);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const showMore = hover || menuOpen || active;
  const rowLabel = board.title || t('nordly.whiteboard.untitled');

  const updateMenuPos = useCallback(() => {
    const el = moreRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos(noteMenuPos(r, MENU_W));
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
    }
  }, [menuOpen]);

  useVaultRowMenuDismiss(menuOpen, closeMenu, rowRef, menuRef, updateMenuPos);

  const handleDelete = useCallback(async () => {
    closeMenu();
    try {
      await onDelete(board.id);
    } catch {
      /* surfaced in WhiteboardPage */
    }
  }, [board.id, onDelete, closeMenu]);

  return (
    <>
      <div
        ref={rowRef}
        className="nordly-note-row-wrap"
        data-active={active ? 'true' : 'false'}
        data-menu-open={menuOpen ? 'true' : 'false'}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => onSelect(board.id)}
      >
        <span className="nordly-note-row__icon" aria-hidden>
          <Icon name="grid" size={16} strokeWidth={1.5} />
        </span>
        <span className="nordly-note-row__label">{rowLabel}</span>

        <button
          ref={moreRef}
          type="button"
          className="nordly-note-row-more focus-ring"
          data-visible={showMore ? 'true' : 'false'}
          data-open={menuOpen ? 'true' : 'false'}
          aria-label={t('nordly.whiteboard.menu.more')}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onMenuOpenChange(!menuOpen);
          }}
        >
          <Icon name="more" size={14} />
        </button>
      </div>

      {menuOpen &&
        menuPos &&
        createPortal(
          <div
            ref={menuRef}
            className="nordly-note-menu"
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, width: MENU_W }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            role="menu"
          >
            {cloudEnabled && active && onShare && (
              <button
                type="button"
                className="nordly-note-menu__item"
                onClick={() => {
                  closeMenu();
                  onShare();
                }}
              >
                <span className="nordly-note-menu__icon" aria-hidden>
                  <Icon name="link" size={14} />
                </span>
                <span className="nordly-note-menu__text">{t('nordly.whiteboard.share')}</span>
              </button>
            )}
            {cloudEnabled && active && onPublish && (
              <button
                type="button"
                className="nordly-note-menu__item"
                onClick={() => {
                  closeMenu();
                  onPublish();
                }}
              >
                <span className="nordly-note-menu__icon" aria-hidden>
                  <Icon name="external" size={14} />
                </span>
                <span className="nordly-note-menu__text">{t('nordly.whiteboard.publish')}</span>
              </button>
            )}
            {cloudEnabled && active && (onShare || onPublish) && (
              <div className="nordly-note-menu__divider" role="separator" />
            )}
            <button
              type="button"
              className="nordly-note-menu__item"
              data-danger="true"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete();
              }}
            >
              <span className="nordly-note-menu__icon" aria-hidden>
                <Icon name="trash" size={14} />
              </span>
              <span className="nordly-note-menu__text">{t('nordly.whiteboard.menu.delete')}</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
});
