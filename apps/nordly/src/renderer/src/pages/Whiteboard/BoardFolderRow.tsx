import { memo, useCallback, useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '@nordly-i18n';

import type { BoardFolder } from '@features/whiteboard/api/whiteboardClient';
import { Icon } from '@shared/ui/primitives/Icon';
import { noteMenuPos } from '@shared/lib/noteMenuPos';
import { useVaultRowMenuDismiss } from '@shared/lib/useVaultRowMenuDismiss';

const MENU_W = 200;

export interface BoardFolderRowProps {
  folder: BoardFolder;
  open: boolean;
  depth: number;
  menuOpen: boolean;
  renaming: boolean;
  dragging?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  onMenuOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onCommitRename: (id: string, name: string) => void;
  onCreateBoard: (folderId: string) => void;
  onCreateFolder: (parentId: string) => void;
  onDelete: (id: string) => void;
}

export const BoardFolderRow = memo(function BoardFolderRow({
  folder,
  open,
  depth,
  menuOpen,
  renaming,
  dragging = false,
  dragHandleProps,
  onMenuOpenChange,
  onToggle,
  onStartRename,
  onCancelRename,
  onCommitRename,
  onCreateBoard,
  onCreateFolder,
  onDelete,
}: BoardFolderRowProps) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const [draftName, setDraftName] = useState(folder.name);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeMenu = useCallback(() => onMenuOpenChange(false), [onMenuOpenChange]);

  const updateMenuPos = useCallback(() => {
    const el = moreRef.current;
    if (!el) return;
    setMenuPos(noteMenuPos(el.getBoundingClientRect(), MENU_W));
  }, []);

  useEffect(() => {
    if (!menuOpen) setMenuPos(null);
  }, [menuOpen]);

  useEffect(() => {
    if (!renaming) return;
    setDraftName(folder.name);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [renaming, folder.name]);

  useVaultRowMenuDismiss(menuOpen, closeMenu, rowRef, menuRef, updateMenuPos);

  const commitRename = useCallback(() => {
    const next = draftName.trim();
    if (!next || next === folder.name) {
      onCancelRename();
      return;
    }
    onCommitRename(folder.id, next);
  }, [draftName, folder.id, folder.name, onCancelRename, onCommitRename]);

  return (
    <div
      ref={rowRef}
      className="nordly-note-row-wrap nordly-folder-row"
      data-open={open ? 'true' : 'false'}
      data-menu-open={menuOpen ? 'true' : 'false'}
      data-renaming={renaming ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      data-depth={depth}
      style={depth > 0 ? { paddingLeft: 10 + depth * 16 } : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (renaming) return;
        onToggle(folder.id);
      }}
      {...(renaming ? undefined : dragHandleProps)}
    >
      <span className="nordly-note-row__icon nordly-folder-row__chevron" aria-hidden>
        <Icon name="chevron-right" size={14} strokeWidth={1.6} />
      </span>
      <span className="nordly-note-row__icon" aria-hidden>
        <Icon name="folder" size={16} strokeWidth={1.5} />
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          className="nordly-folder-row__input"
          value={draftName}
          aria-label={t('nordly.whiteboard.folder.rename_aria')}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitRename();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancelRename();
            }
          }}
        />
      ) : (
        <span
          className="nordly-note-row__label"
          onDoubleClick={(event) => {
            event.stopPropagation();
            closeMenu();
            onStartRename(folder.id);
          }}
        >
          {folder.name}
        </span>
      )}
      <button
        ref={moreRef}
        type="button"
        className="nordly-note-row-more focus-ring"
        data-visible={hover || menuOpen ? 'true' : 'false'}
        data-open={menuOpen ? 'true' : 'false'}
        aria-label={t('nordly.whiteboard.folder.menu_more')}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onMenuOpenChange(!menuOpen);
        }}
      >
        <Icon name="more" size={14} />
      </button>
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
            <button
              type="button"
              className="nordly-note-menu__item"
              onClick={() => {
                closeMenu();
                onCreateBoard(folder.id);
              }}
            >
              <span className="nordly-note-menu__text">{t('nordly.whiteboard.new')}</span>
            </button>
            <button
              type="button"
              className="nordly-note-menu__item"
              onClick={() => {
                closeMenu();
                onCreateFolder(folder.id);
              }}
            >
              <span className="nordly-note-menu__text">{t('nordly.whiteboard.new_folder')}</span>
            </button>
            <button
              type="button"
              className="nordly-note-menu__item"
              onClick={() => {
                closeMenu();
                onStartRename(folder.id);
              }}
            >
              <span className="nordly-note-menu__text">{t('nordly.whiteboard.folder.rename')}</span>
            </button>
            <div className="nordly-note-menu__divider" role="separator" />
            <button
              type="button"
              className="nordly-note-menu__item"
              data-danger="true"
              onClick={() => {
                closeMenu();
                onDelete(folder.id);
              }}
            >
              <span className="nordly-note-menu__text">{t('nordly.whiteboard.folder.delete')}</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
});
