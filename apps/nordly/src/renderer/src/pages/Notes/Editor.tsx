import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ViewUpdate } from '@codemirror/view';

import { useT } from '@nordly-i18n';
import type { WikiTarget } from '@nordly-markdown/wikiTarget';

import type { Note } from '@features/notes/api/notesClient';
import { isNoteVaultLocked } from '@features/notes/api/notesClient';
import {
  createNoteAttachmentFromFile,
  resolveAttachmentObjectUrl,
} from '@features/notes/api/attachmentsClient';
import { fillCardTranslations } from '@features/cards/lib/fillCardTranslations';
import { countNoteCards } from '@features/cards/lib/parseCards';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { parseNordlyAssetId } from '@shared/lib/nordlyAsset';
import { readSettings } from '@shared/model/settings';
import { Kbd } from '@shared/ui/primitives/Kbd';
import { Icon } from '@shared/ui/primitives/Icon';
import { LiveMarkdownEditor } from '@shared/ui/LiveMarkdownEditor';
import type { ImageHrefResolver } from '@shared/lib/codemirror/livePreview';
import { openSettings, SettingsSectionId } from '@shared/model/settingsNav';
import { formatTime, NoteListStatus, type ListState } from './utils';
import { NoteSaveStatus, type NoteSaveStatus as SaveStatus } from './saveStatus';

export interface EditorProps {
  list: ListState;
  active: Note | null;
  /** Bumps only on intentional note switch — keeps title focus across vault rename autosave. */
  editorSessionKey: number;
  activeError: string | null;
  draftTitle: string;
  draftBody: string;
  saveStatus: SaveStatus;
  noteTitles: string[];
  boardTitles: string[];
  editorZoom: number;
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onWikiTargetClick: (target: WikiTarget) => void;
  onReviewNote?: () => void;
  onCreate: () => void;
  onRetryList: () => void;
  onError?: (message: string) => void;
}

export function Editor({
  list,
  active,
  editorSessionKey,
  activeError,
  draftTitle,
  draftBody,
  saveStatus,
  noteTitles,
  boardTitles,
  editorZoom,
  onTitleChange,
  onBodyChange,
  onWikiTargetClick,
  onReviewNote,
  onCreate,
  onRetryList,
  onError,
}: EditorProps) {
  return (
    <section
      className="nordly-vault-editor nordly-notes-editor"
      style={{ ['--nordly-notes-zoom' as string]: String(editorZoom) }}
    >
      <div className="nordly-vault-editor__inner">
        {list.status === NoteListStatus.Failed ? (
          <ErrorPane message={list.error} onRetry={onRetryList} />
        ) : !active &&
          list.status === NoteListStatus.Ready &&
          list.notes.length === 0 ? (
          <EmptyState onCreate={onCreate} />
        ) : !active ? (
          <EmptyState onCreate={onCreate} dim />
        ) : isNoteVaultLocked(active) ? (
          <VaultLockedPane />
        ) : (
          <ActiveEditor
            key={editorSessionKey}
            noteId={active.id}
            title={draftTitle}
            body={draftBody}
            noteTitles={noteTitles}
            boardTitles={boardTitles}
            onTitleChange={onTitleChange}
            onBodyChange={onBodyChange}
            onWikiTargetClick={onWikiTargetClick}
            onReviewNote={onReviewNote}
            onError={onError}
          />
        )}
      </div>

      {active && !isNoteVaultLocked(active) && (
        <div className="mono nordly-notes-editor-meta nordly-vault-editor__meta">
          <SaveStatusIndicator status={saveStatus} />
          <span>{formatTime(active.updatedAt)}</span>
        </div>
      )}

      {activeError && <p className="mono nordly-vault-editor__error">{activeError}</p>}
    </section>
  );
}

function VaultLockedPane() {
  const t = useT();
  return (
    <div className="nordly-vault-empty nordly-notes-vault-locked">
      <span className="nordly-notes-vault-locked__icon" aria-hidden>
        <Icon name="lock" size={22} strokeWidth={1.5} />
      </span>
      <p className="nordly-notes-vault-locked__title">{t('nordly.notes.vault_locked_title')}</p>
      <p className="nordly-notes-vault-locked__body">{t('nordly.notes.vault_locked_body')}</p>
      <button
        type="button"
        className="nordly-vault-empty__cta focus-ring"
        onClick={() => openSettings({ section: SettingsSectionId.Sync })}
      >
        {t('nordly.notes.vault_locked_cta')}
      </button>
    </div>
  );
}

function ActiveEditor({
  noteId,
  title,
  body,
  noteTitles,
  boardTitles,
  onTitleChange,
  onBodyChange,
  onWikiTargetClick,
  onReviewNote,
  onError,
}: {
  noteId: string;
  title: string;
  body: string;
  noteTitles: string[];
  boardTitles: string[];
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onWikiTargetClick: (target: WikiTarget) => void;
  onReviewNote?: () => void;
  onError?: (message: string) => void;
}) {
  const t = useT();
  const [cardsOn, setCardsOn] = useState(() => readSettings().flashcards.enabled);
  useEffect(() => {
    const sync = () => setCardsOn(readSettings().flashcards.enabled);
    window.addEventListener(NORDLY_EVENTS.settingsChanged, sync);
    return () => window.removeEventListener(NORDLY_EVENTS.settingsChanged, sync);
  }, []);
  const cardCount = useMemo(() => countNoteCards(noteId, title, body), [body, noteId, title]);

  const resolveImageHref = useMemo((): ImageHrefResolver => {
    return async (href: string) => {
      if (/^https:\/\//i.test(href)) return href;
      const { isNotesVaultBound, resolveVaultImageHref } = await import('@features/notes/api/vault');
      if (await isNotesVaultBound()) {
        return resolveVaultImageHref(href, noteId);
      }
      const id = parseNordlyAssetId(href);
      if (!id) return null;
      return resolveAttachmentObjectUrl(id);
    };
  }, [noteId]);

  const onInsertImageFile = useCallback(
    async (file: File) => {
      const { markdown } = await createNoteAttachmentFromFile(noteId, file);
      return markdown;
    },
    [noteId],
  );

  const onAttachmentError = useCallback(
    (err: unknown) => {
      if (err && typeof err === 'object' && 'code' in err) {
        const code = String((err as { code: string }).code);
        const key = `nordly.notes.attachment.${code}`;
        const msg = t(key);
        if (msg !== key) {
          onError?.(msg);
          return;
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      onError?.(message);
    },
    [onError, t],
  );
  const applyingCardTranslationRef = useRef(false);
  const onDocChanged = useCallback(
    (update: ViewUpdate) => {
      fillCardTranslations(update, {
        enabled: cardsOn,
        applying: applyingCardTranslationRef,
        onError: onAttachmentError,
      });
    },
    [cardsOn, onAttachmentError],
  );

  const titleEmpty = !title.trim();

  return (
    <div className="nordly-notes-editor-shell">
      {cardsOn && cardCount > 0 && onReviewNote ? (
        <button type="button" className="nordly-notes-review-note focus-ring" onClick={onReviewNote}>
          {t('nordly.cards.review_note', { count: String(cardCount) })}
        </button>
      ) : null}
      <input
        className="nordly-notes-title"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder={t('nordly.notes.editor.title_placeholder')}
        autoFocus={titleEmpty}
      />
      <LiveMarkdownEditor
        value={body}
        onChange={onBodyChange}
        placeholder={t('nordly.notes.editor.body_placeholder')}
        noteTitles={noteTitles}
        boardTitles={boardTitles}
        flashcardsEnabled={cardsOn}
        onWikiTargetClick={onWikiTargetClick}
        resolveImageHref={resolveImageHref}
        onInsertImageFile={onInsertImageFile}
        onAttachmentError={onAttachmentError}
        onDocChanged={onDocChanged}
        autoFocus={!titleEmpty}
      />
    </div>
  );
}

export function EmptyState({ onCreate, dim = false }: { onCreate: () => void; dim?: boolean }) {
  const t = useT();
  const text = t(dim ? 'nordly.notes.empty_dim' : 'nordly.notes.empty_fresh');
  const [before, after = ''] = text.split('⌘N');
  return (
    <div className="nordly-vault-empty" data-dim={dim ? 'true' : 'false'}>
      <p>
        {before}
        <Kbd>⌘N</Kbd>
        {after}
      </p>
      {!dim && (
        <button type="button" onClick={onCreate} className="nordly-vault-empty__cta focus-ring">
          {t('nordly.notes.empty_cta')}
        </button>
      )}
    </div>
  );
}

export function ErrorPane({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="data-loader-error" style={{ maxWidth: 480 }}>
      <div className="data-loader-error-stripe" />
      <div className="data-loader-error-body">
        <div className="data-loader-error-label">{t('nordly.notes.error_load')}</div>
        {message && <div className="data-loader-error-detail">{message}</div>}
        <button
          type="button"
          className="data-loader-error-retry focus-ring motion-press"
          onClick={onRetry}
        >
          {t('nordly.error.retry')}
        </button>
      </div>
    </div>
  );
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  const t = useT();
  if (status === NoteSaveStatus.Idle) return null;
  return (
    <span role="status" aria-live="polite" aria-atomic="true">
      {status === NoteSaveStatus.Saving ? t('nordly.notes.saving') : t('nordly.notes.saved')}
    </span>
  );
}
