import { useT } from '@nordly-i18n';

import type { Note } from '@features/notes/api/notesClient';
import { isNoteVaultLocked } from '@features/notes/api/notesClient';
import { Kbd } from '@shared/ui/primitives/Kbd';
import { Icon } from '@shared/ui/primitives/Icon';
import { LiveMarkdownEditor } from '@shared/ui/LiveMarkdownEditor';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { formatTime, type ListState } from './utils';

export interface EditorProps {
  list: ListState;
  active: Note | null;
  activeError: string | null;
  draftTitle: string;
  draftBody: string;
  saveStatus: 'idle' | 'saving' | 'saved';
  noteTitles: string[];
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onWikiLinkClick: (linkText: string) => void;
  onCreate: () => void;
  onRetryList: () => void;
}

export function Editor({
  list,
  active,
  activeError,
  draftTitle,
  draftBody,
  saveStatus,
  noteTitles,
  onTitleChange,
  onBodyChange,
  onWikiLinkClick,
  onCreate,
  onRetryList,
}: EditorProps) {
  return (
    <section className="nordly-vault-editor nordly-notes-editor">
      <div className="nordly-vault-editor__inner">
        {list.status === 'error' ? (
          <ErrorPane message={list.error ?? ''} onRetry={onRetryList} />
        ) : !active && list.status === 'ok' && list.notes.length === 0 ? (
          <EmptyState onCreate={onCreate} />
        ) : !active ? (
          <EmptyState onCreate={onCreate} dim />
        ) : isNoteVaultLocked(active) ? (
          <VaultLockedPane />
        ) : (
          <ActiveEditor
            key={active.id}
            title={draftTitle}
            body={draftBody}
            noteTitles={noteTitles}
            onTitleChange={onTitleChange}
            onBodyChange={onBodyChange}
            onWikiLinkClick={onWikiLinkClick}
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
        onClick={() => window.dispatchEvent(new Event(NORDLY_EVENTS.openSettings))}
      >
        {t('nordly.notes.vault_locked_cta')}
      </button>
    </div>
  );
}

function ActiveEditor({
  title,
  body,
  noteTitles,
  onTitleChange,
  onBodyChange,
  onWikiLinkClick,
}: {
  title: string;
  body: string;
  noteTitles: string[];
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onWikiLinkClick: (linkText: string) => void;
}) {
  const t = useT();
  return (
    <div className="nordly-notes-editor-shell">
      <input
        className="nordly-notes-title"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder={t('nordly.notes.editor.title_placeholder')}
        autoFocus={!title}
      />
      <LiveMarkdownEditor
        value={body}
        onChange={onBodyChange}
        placeholder={t('nordly.notes.editor.body_placeholder')}
        noteTitles={noteTitles}
        onWikiLinkClick={onWikiLinkClick}
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

function SaveStatusIndicator({ status }: { status: 'idle' | 'saving' | 'saved' }) {
  const t = useT();
  if (status === 'idle') return null;
  return (
    <span role="status" aria-live="polite" aria-atomic="true">
      {status === 'saving' ? t('nordly.notes.saving') : t('nordly.notes.saved')}
    </span>
  );
}
