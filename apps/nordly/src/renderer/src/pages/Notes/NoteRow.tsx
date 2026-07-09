import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '@nordly-i18n';

import type { NoteSummary, PublishStatus, PublishToWebOptions } from '@features/notes/api/notesClient';
import { getPublishStatus, isNoteVaultLocked } from '@features/notes/api/notesClient';
import { DEFAULT_PUBLISH_OPTIONS, type PublishFeatureEntitlements } from '@features/notes/model/publishOptions';
import { fetchBillingMe } from '@shared/api/billingClient';
import { Icon } from '@shared/ui/primitives/Icon';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { isVaultReadyForPublish } from '@shared/crypto/vaultPublish';
import { noteMenuPos } from '@shared/lib/noteMenuPos';
import { useVaultRowMenuDismiss } from '@shared/lib/useVaultRowMenuDismiss';

import { NoteRowMenu } from './NoteRowMenu';

const MENU_W = 168;
const MENU_W_WIDE = 240;

export interface NoteRowProps {
  note: NoteSummary;
  active: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onPublish: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUnpublish: (id: string) => Promise<void>;
  onRegenerate: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onDelete: (id: string) => Promise<void>;
}

export const NoteRow = memo(function NoteRow({
  note,
  active,
  menuOpen,
  onMenuOpenChange,
  onSelect,
  onPublish,
  onUnpublish,
  onRegenerate,
  onDelete,
}: NoteRowProps) {
  const t = useT();
  const [hover, setHover] = useState(false);
  const closeMenu = useCallback(() => onMenuOpenChange(false), [onMenuOpenChange]);
  const [pubStatus, setPubStatus] = useState<PublishStatus | null>(null);
  const [publishOptions, setPublishOptions] = useState<PublishToWebOptions>(DEFAULT_PUBLISH_OPTIONS);
  const [publishEntitlements, setPublishEntitlements] = useState<PublishFeatureEntitlements | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const publishingAvailable = isCloudApiAvailable();
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const showMore = hover || menuOpen || active;
  const vaultLocked = isNoteVaultLocked(note);
  const rowLabel = vaultLocked
    ? t('nordly.notes.vault_locked_list')
    : note.title || t('nordly.notes.untitled');

  const menuWide = publishingAvailable && publishOptions.passwordProtected;
  const menuW = menuWide ? MENU_W_WIDE : MENU_W;

  const updateMenuPos = useCallback(() => {
    const el = moreRef.current;
    if (!el) return;
    setMenuPos(noteMenuPos(el.getBoundingClientRect(), menuW));
  }, [menuW]);

  useEffect(() => {
    if (!menuOpen || !publishingAvailable) return;
    let live = true;
    void Promise.all([
      getPublishStatus(note.id),
      fetchBillingMe().catch(() => null),
    ])
      .then(([status, billing]) => {
        if (!live) return;
        setPubStatus(status);
        if (billing) {
          setPublishEntitlements({
            publishPrivateLink: billing.features.publish_password === true,
          });
        }
      })
      .catch(() => {
        if (!live) return;
        setPubStatus(null);
      });
    return () => {
      live = false;
    };
  }, [menuOpen, note.id, publishingAvailable]);

  useEffect(() => {
    if (!menuOpen) {
      setPublishOptions(DEFAULT_PUBLISH_OPTIONS);
      setPublishEntitlements(null);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
  }, [menuOpen, menuW, updateMenuPos]);

  useVaultRowMenuDismiss(menuOpen, closeMenu, rowRef, menuRef, updateMenuPos);

  const copyLink = useCallback(async () => {
    const url = pubStatus?.url;
    if (!url) return;
    closeMenu();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }, [pubStatus?.url, closeMenu]);

  const viewPublic = useCallback(() => {
    const url = pubStatus?.url;
    if (!url) return;
    closeMenu();
    const open = window.nordly?.shell.openExternal;
    if (open) void open(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }, [pubStatus?.url, closeMenu]);

  const handlePublish = useCallback(async () => {
    closeMenu();
    try {
      const res = await onPublish(note.id, publishOptions);
      if (res) setPubStatus(res);
    } catch {
      /* error surfaced in NotesPage */
    }
  }, [note.id, onPublish, publishOptions, closeMenu]);

  const handleUnpublish = useCallback(async () => {
    closeMenu();
    try {
      await onUnpublish(note.id);
      setPubStatus({ published: false });
    } catch {
      /* error surfaced in NotesPage */
    }
  }, [note.id, onUnpublish, closeMenu]);

  const handleRegenerate = useCallback(async () => {
    closeMenu();
    try {
      const res = await onRegenerate(note.id, publishOptions);
      if (res) setPubStatus(res);
    } catch {
      /* error surfaced in NotesPage */
    }
  }, [note.id, onRegenerate, publishOptions, closeMenu]);

  const handleDelete = useCallback(async () => {
    closeMenu();
    try {
      await onDelete(note.id);
    } catch {
      /* error surfaced in NotesPage */
    }
  }, [note.id, onDelete, closeMenu]);

  return (
    <>
      <div
        ref={rowRef}
        className="nordly-note-row-wrap"
        data-active={active ? 'true' : 'false'}
        data-menu-open={menuOpen ? 'true' : 'false'}
        data-vault-locked={vaultLocked ? 'true' : 'false'}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => onSelect(note.id)}
      >
        <span className="nordly-note-row__icon" aria-hidden>
          <Icon name={vaultLocked ? 'lock' : 'file'} size={16} strokeWidth={1.5} />
        </span>
        <span className="nordly-note-row__label">{rowLabel}</span>

        <button
          ref={moreRef}
          type="button"
          className="nordly-note-row-more focus-ring"
          data-visible={showMore ? 'true' : 'false'}
          data-open={menuOpen ? 'true' : 'false'}
          aria-label={t('nordly.notes.menu.more')}
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
          <NoteRowMenu
            ref={menuRef}
            published={!!pubStatus?.published}
            publishingAvailable={publishingAvailable}
            vaultReady={isVaultReadyForPublish()}
            publishOptions={publishOptions}
            publishEntitlements={publishEntitlements}
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              width: menuW,
            }}
            onPublishOptionsChange={(patch) => setPublishOptions((prev) => ({ ...prev, ...patch }))}
            onPublish={() => void handlePublish()}
            onCopyLink={() => void copyLink()}
            onViewPublic={viewPublic}
            onRegenerate={() => void handleRegenerate()}
            onUnpublish={() => void handleUnpublish()}
            onDelete={() => void handleDelete()}
          />,
          document.body,
        )}
    </>
  );
});
