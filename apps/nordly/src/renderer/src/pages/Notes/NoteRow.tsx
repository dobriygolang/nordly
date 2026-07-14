import { memo, useCallback, useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

import { useT } from '@nordly-i18n';

import type {
  NoteSummary,
  PublishStatus,
  PublishToWebOptions,
} from '@features/notes/api/notesClient';
import { getPublishStatus, isNoteVaultLocked } from '@features/notes/api/notesClient';
import {
  DEFAULT_PUBLISH_OPTIONS,
  canApplyPublishOptions,
  publishOptionsFromStatus,
  serializePublishOptions,
  type PublishFeatureEntitlements,
} from '@features/notes/model/publishOptions';
import { fetchBillingMeCached } from '@shared/api/billingClient';
import { Icon } from '@shared/ui/primitives/Icon';
import { isCloudApiAvailable } from '@shared/sync/syncConfig';
import { isVaultReadyForPublish } from '@shared/crypto/vaultPublish';
import { noteMenuPos } from '@shared/lib/noteMenuPos';
import { useVaultRowMenuDismiss } from '@shared/lib/useVaultRowMenuDismiss';

import { NoteRowMenu } from './NoteRowMenu';

const MENU_W = 168;
const MENU_W_WIDE = 240;
const PUBLISH_OPTIONS_SAVE_MS = 800;

export interface NoteRowProps {
  note: NoteSummary;
  active: boolean;
  menuOpen: boolean;
  dragging?: boolean;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
  onMenuOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onPublish: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUpdatePublishOptions: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUnpublish: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const NoteRow = memo(function NoteRow({
  note,
  active,
  menuOpen,
  dragging = false,
  dragHandleProps,
  onMenuOpenChange,
  onSelect,
  onPublish,
  onUpdatePublishOptions,
  onUnpublish,
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
  const serverPasswordProtectedRef = useRef(false);
  const lastAppliedOptionsRef = useRef(serializePublishOptions(DEFAULT_PUBLISH_OPTIONS));
  const publishOptionsDirtyRef = useRef(false);
  const publishOptionsRef = useRef(publishOptions);
  const publishInFlightRef = useRef<Promise<PublishStatus | void> | null>(null);
  publishOptionsRef.current = publishOptions;

  const applyPublishResult = useCallback((status: PublishStatus, keepPassword = '') => {
    setPubStatus(status);
    const synced = publishOptionsFromStatus(status);
    serverPasswordProtectedRef.current = status.passwordProtected === true;
    const next = { ...synced, password: keepPassword };
    lastAppliedOptionsRef.current = serializePublishOptions(next);
    setPublishOptions(next);
  }, []);

  const handlePublishOptionsChange = useCallback((patch: Partial<PublishToWebOptions>) => {
    publishOptionsDirtyRef.current = true;
    setPublishOptions((prev) => ({ ...prev, ...patch }));
  }, []);

  const showMore = hover || menuOpen || active;
  const vaultLocked = isNoteVaultLocked(note);
  const rowLabel = vaultLocked
    ? t('nordly.notes.vault_locked_list')
    : note.title || t('nordly.notes.untitled');

  const menuWide =
    publishingAvailable &&
    (publishEntitlements === null || publishEntitlements.publishPrivateLink === true);
  const menuW = menuWide ? MENU_W_WIDE : MENU_W;

  const updateMenuPos = useCallback(() => {
    const el = moreRef.current;
    if (!el) return;
    setMenuPos(noteMenuPos(el.getBoundingClientRect(), menuW));
  }, [menuW]);

  useEffect(() => {
    if (!menuOpen || !publishingAvailable) return;
    publishOptionsDirtyRef.current = false;
    let live = true;
    void (async () => {
      if (publishInFlightRef.current) {
        await publishInFlightRef.current.catch(() => undefined);
        if (!live) return;
      }
      const [status, billing] = await Promise.all([
        getPublishStatus(note.id),
        fetchBillingMeCached().catch(() => null),
      ]);
      if (!live) return;
      setPubStatus(status);
      if (!publishOptionsDirtyRef.current) {
        const opts = publishOptionsFromStatus(status);
        setPublishOptions(opts);
        serverPasswordProtectedRef.current = status.passwordProtected === true;
        lastAppliedOptionsRef.current = serializePublishOptions(opts);
      }
      if (billing) {
        setPublishEntitlements({
          publishPrivateLink: billing.features.publish_password === true,
        });
      }
    })().catch(() => {
      if (!live) return;
      setPubStatus(null);
    });
    return () => {
      live = false;
    };
  }, [menuOpen, note.id, publishingAvailable]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPos(null);
      return;
    }
    updateMenuPos();
  }, [menuOpen, menuW, updateMenuPos]);

  useEffect(() => {
    if (!menuOpen || !pubStatus?.published) return;

    const serialized = serializePublishOptions(publishOptions);
    if (serialized === lastAppliedOptionsRef.current) return;
    if (!canApplyPublishOptions(publishOptions, serverPasswordProtectedRef.current)) return;

    const timer = window.setTimeout(() => {
      const snapshot = serializePublishOptions(publishOptions);
      void onUpdatePublishOptions(note.id, publishOptions)
        .then((res) => {
          if (!res) return;
          if (serializePublishOptions(publishOptionsRef.current) !== snapshot) return;
          applyPublishResult(res, publishOptionsRef.current.password);
        })
        .catch(() => {
          /* surfaced in NotesPage */
        });
    }, PUBLISH_OPTIONS_SAVE_MS);

    return () => window.clearTimeout(timer);
  }, [menuOpen, note.id, onUpdatePublishOptions, pubStatus?.published, publishOptions, applyPublishResult]);

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
    const optionsToPublish = publishOptionsRef.current;
    closeMenu();
    const publishPromise = onPublish(note.id, optionsToPublish)
      .then((res) => {
        if (res) applyPublishResult(res, optionsToPublish.password);
        return res;
      })
      .finally(() => {
        if (publishInFlightRef.current === publishPromise) {
          publishInFlightRef.current = null;
        }
      });
    publishInFlightRef.current = publishPromise;
    try {
      await publishPromise;
    } catch {
      /* error surfaced in NotesPage */
    }
  }, [note.id, onPublish, closeMenu, applyPublishResult]);

  const handleUnpublish = useCallback(async () => {
    closeMenu();
    try {
      await onUnpublish(note.id);
      setPubStatus({ published: false });
    } catch {
      /* error surfaced in NotesPage */
    }
  }, [note.id, onUnpublish, closeMenu]);

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
        data-dragging={dragging ? 'true' : 'false'}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        {...dragHandleProps}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button, [data-no-drag]')) return;
          onSelect(note.id);
        }}
      >
        <span className="nordly-note-row__icon" aria-hidden>
          <Icon name={vaultLocked ? 'lock' : 'file'} size={16} strokeWidth={1.5} />
        </span>
        <span className="nordly-note-row__label">{rowLabel}</span>

        <button
          ref={moreRef}
          type="button"
          data-no-drag
          className="nordly-note-row-more focus-ring"
          data-visible={showMore ? 'true' : 'false'}
          data-open={menuOpen ? 'true' : 'false'}
          aria-label={t('nordly.notes.menu.more')}
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
          <NoteRowMenu
            ref={menuRef}
            published={!!pubStatus?.published}
            publishingAvailable={publishingAvailable}
            vaultReady={isVaultReadyForPublish()}
            publishOptions={publishOptions}
            publishEntitlements={publishEntitlements}
            serverPasswordProtected={serverPasswordProtectedRef.current}
            style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              width: menuW,
            }}
            onPublishOptionsChange={handlePublishOptionsChange}
            onPublish={() => void handlePublish()}
            onCopyLink={() => void copyLink()}
            onViewPublic={viewPublic}
            onUnpublish={() => void handleUnpublish()}
            onDelete={() => void handleDelete()}
          />,
          document.body,
        )}
    </>
  );
});
