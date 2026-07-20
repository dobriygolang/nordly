import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '@nordly-i18n';

import type { NoteFolder } from '@features/notes/api/notesClient';
import { Icon } from '@shared/ui/primitives/Icon';
import { noteMenuPos } from '@shared/lib/noteMenuPos';
import { useVaultRowMenuDismiss } from '@shared/lib/useVaultRowMenuDismiss';

const MENU_W = 168;

export interface FolderRowProps {
  folder: NoteFolder;
  open: boolean;
  menuOpen: boolean;
  renaming: boolean;
  depth?: number;
  onMenuOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
  onStartRename: (id: string) => void;
  onCommitRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onDelete: (id: string) => Promise<void>;
}

export const FolderRow = memo(function FolderRow({
  folder,
  open,
  menuOpen,
  renaming,
  depth = 0,
  onMenuOpenChange,
  onToggle,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: FolderRowProps) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const [draftName, setDraftName] = useState(folder.name);
  const closeMenu = useCallback(() => onMenuOpenChange(false), [onMenuOpenChange]);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const showMore = hover || menuOpen;

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

  const handleDelete = useCallback(async () => {
    closeMenu();
    try {
      await onDelete(folder.id);
    } catch {
      /* surfaced in NotesPage */
    }
  }, [folder.id, onDelete, closeMenu]);

  return (
    <>
      <div
        ref={rowRef}
        className="nordly-note-row-wrap nordly-folder-row"
        data-open={open ? 'true' : 'false'}
        data-menu-open={menuOpen ? 'true' : 'false'}
        data-renaming={renaming ? 'true' : 'false'}
        data-depth={depth}
        style={depth > 0 ? { paddingLeft: 10 + depth * 16 } : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => {
          if (renaming) return;
          onToggle(folder.id);
        }}
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
            aria-label={t('nordly.notes.folder.rename_aria')}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
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
            onClick={(event) => {
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
          data-visible={showMore || renaming ? 'true' : 'false'}
          data-open={menuOpen ? 'true' : 'false'}
          aria-label={t('nordly.notes.folder.menu_more')}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
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
            <button
              type="button"
              className="nordly-note-menu__item"
              data-danger="true"
              onClick={() => void handleDelete()}
            >
              <span className="nordly-note-menu__icon" aria-hidden>
                <Icon name="trash" size={14} strokeWidth={1.5} />
              </span>
              <span className="nordly-note-menu__text">{t('nordly.notes.folder.delete')}</span>
            </button>
          </div>,
          document.body,
        )}
    </>
  );
});
