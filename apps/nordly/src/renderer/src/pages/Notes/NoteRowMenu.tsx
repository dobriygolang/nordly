import '@shared/ui/VaultRowMenu.css';
import { forwardRef, memo, useCallback } from 'react';

import { useT } from '@nordly-i18n';

import {
  canApplyPublishOptions,
  parsePublishExpiryDays,
  PUBLISH_EXPIRY_OPTIONS,
  type PublishToWebOptions,
} from '@features/notes/model/publishOptions';
import { Icon } from '@shared/ui/primitives/Icon';
import { openSettings, SettingsHighlightId, SettingsSectionId } from '@shared/model/settingsNav';

export interface NoteRowMenuProps {
  published: boolean;
  publishing?: boolean;
  linkCopied?: boolean;
  copyError?: string | null;
  publishingAvailable: boolean;
  publishBlocked: 'sync_off' | 'encryption_locked' | null;
  vaultReady: boolean;
  publishOptions: PublishToWebOptions;
  serverPasswordProtected: boolean;
  style?: React.CSSProperties;
  onPublishOptionsChange: (patch: Partial<PublishToWebOptions>) => void;
  onPublish: () => void;
  onCopyLink: () => void;
  onViewPublic: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
  /** null hides the switch. Shown only while flashcards are enabled. */
  captureWords: boolean | null;
  onCaptureWordsChange: (on: boolean) => void;
}

function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="nordly-note-menu__item"
      data-danger={danger ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <span className="nordly-note-menu__icon" aria-hidden>
        {icon}
      </span>
      <span className="nordly-note-menu__text">{label}</span>
    </button>
  );
}

function MenuDivider() {
  return <div className="nordly-note-menu__divider" role="separator" />;
}

function MenuToggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(!checked);
    },
    [checked, onChange],
  );

  return (
    <button
      type="button"
      className="nordly-note-menu__toggle"
      role="switch"
      disabled={disabled}
      aria-checked={checked}
      data-checked={checked ? 'true' : 'false'}
      onClick={handleClick}
    >
      <span className="nordly-note-menu__toggle-track" aria-hidden>
        <span className="nordly-note-menu__toggle-thumb" />
      </span>
      <span className="nordly-note-menu__toggle-text">
        <span>{label}</span>
      </span>
    </button>
  );
}

function PublishOptionsSection({
  publishOptions,
  onPublishOptionsChange,
  disabled = false,
}: {
  publishOptions: PublishToWebOptions;
  onPublishOptionsChange: (patch: Partial<PublishToWebOptions>) => void;
  disabled?: boolean;
}) {
  const t = useT();

  return (
    <div className="nordly-note-menu__options">
      <MenuToggle
        disabled={disabled}
        label={t('nordly.notes.menu.private_link')}
        checked={publishOptions.passwordProtected}
        onChange={(passwordProtected) =>
          onPublishOptionsChange({
            passwordProtected,
            password: passwordProtected ? publishOptions.password : '',
            expiresInDays: passwordProtected ? publishOptions.expiresInDays : 0,
          })
        }
      />
      {publishOptions.passwordProtected ? (
        <>
          <label className="nordly-note-menu__password">
            <span className="nordly-note-menu__password-label">
              {t('nordly.notes.menu.private_link_password_label')}
            </span>
            <input
              type="password"
              disabled={disabled}
              className="nordly-note-menu__password-input mono"
              value={publishOptions.password}
              placeholder={t('nordly.notes.menu.private_link_password_placeholder')}
              minLength={4}
              autoComplete="new-password"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onPublishOptionsChange({ password: e.target.value })}
            />
          </label>
          <label className="nordly-note-menu__expiry">
            <span className="nordly-note-menu__password-label">{t('nordly.notes.menu.publish_expiry_label')}</span>
            <span className="nordly-select-wrap nordly-select-wrap--block">
              <select
                className="nordly-select nordly-select--block mono focus-ring"
                disabled={disabled}
                value={publishOptions.expiresInDays}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  onPublishOptionsChange({ expiresInDays: parsePublishExpiryDays(e.target.value) })
                }
              >
                {PUBLISH_EXPIRY_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    {days === 0
                      ? t('nordly.notes.menu.publish_expiry_never')
                      : t('nordly.notes.menu.publish_expiry_days', { days })}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </>
      ) : null}
    </div>
  );
}

export const NoteRowMenu = memo(
  forwardRef<HTMLDivElement, NoteRowMenuProps>(function NoteRowMenu(
    {
      published,
      publishing = false,
      linkCopied = false,
      copyError = null,
      publishingAvailable,
      publishBlocked,
      vaultReady,
      publishOptions,
      serverPasswordProtected,
      style,
      onPublishOptionsChange,
      onPublish,
      onCopyLink,
      onViewPublic,
      onUnpublish,
      onDelete,
      captureWords,
      onCaptureWordsChange,
    },
    ref,
  ) {
    const t = useT();
    const passwordInvalid = !canApplyPublishOptions(publishOptions, serverPasswordProtected);

    return (
      <div
        ref={ref}
        className="nordly-note-menu"
        data-published={published ? 'true' : 'false'}
        data-compact={publishingAvailable ? 'false' : 'true'}
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        role="menu"
      >
        {publishingAvailable ? (
          publishBlocked ? (
            <>
              <div className="nordly-note-menu__label mono">{t('nordly.notes.menu.publishing')}</div>
              <p className="nordly-note-menu__label">
                {t(
                  publishBlocked === 'encryption_locked'
                    ? 'nordly.settings.vault.locked_publish'
                    : 'nordly.notes.sync.publish_blocked',
                )}
              </p>
              <MenuItem
                icon={<Icon name="settings" size={14} strokeWidth={1.5} />}
                label={t('nordly.notes.sync.open_settings')}
                onClick={() =>
                  openSettings({
                    section: SettingsSectionId.Sync,
                    highlight: SettingsHighlightId.NotesSync,
                  })
                }
              />
              <MenuDivider />
            </>
          ) : (
          <>
            <div className="nordly-note-menu__label mono">{t('nordly.notes.menu.publishing')}</div>
            {published ? (
              <>
                <MenuItem
                  icon={<Icon name="copy" size={14} strokeWidth={1.5} />}
                  label={t(linkCopied ? 'nordly.notes.menu.link_copied' : 'nordly.notes.menu.copy_link')}
                  onClick={onCopyLink}
                  disabled={publishing}
                />
                <MenuItem
                  icon={<Icon name="external" size={14} strokeWidth={1.5} />}
                  label={t('nordly.notes.menu.view_public')}
                  onClick={onViewPublic}
                />
                <PublishOptionsSection
                  disabled={publishing}
                  publishOptions={publishOptions}
                  onPublishOptionsChange={onPublishOptionsChange}
                />
                <MenuItem
                  icon={<Icon name="unlink" size={14} strokeWidth={1.5} />}
                  label={t('nordly.notes.menu.unpublish')}
                  onClick={onUnpublish}
                  disabled={publishing}
                  danger
                />
              </>
            ) : (
              <>
                <p className="nordly-note-menu__hint">{t('nordly.notes.menu.publish_hint')}</p>
                <PublishOptionsSection
                  disabled={publishing}
                  publishOptions={publishOptions}
                  onPublishOptionsChange={onPublishOptionsChange}
                />
                <MenuItem
                  icon={<Icon name="link" size={14} strokeWidth={1.5} />}
                  label={t(publishing ? 'nordly.notes.menu.publish_busy' : 'nordly.notes.menu.publish')}
                  onClick={onPublish}
                  disabled={publishing || !vaultReady || passwordInvalid}
                />
              </>
            )}
            {copyError ? <p className="nordly-note-menu__hint nordly-note-menu__error" role="alert">{copyError}</p> : null}
            <MenuDivider />
          </>
          )
        ) : null}

        {captureWords !== null ? (
          <>
            <div className="nordly-note-menu__label mono">{t('nordly.notes.menu.words')}</div>
            <MenuToggle
              label={t('nordly.notes.menu.capture_words')}
              checked={captureWords}
              onChange={onCaptureWordsChange}
            />
            <p className="nordly-note-menu__hint">{t('nordly.notes.menu.capture_words_hint')}</p>
            <MenuDivider />
          </>
        ) : null}

        <MenuItem
          icon={<Icon name="trash" size={14} strokeWidth={1.5} />}
          label={t('nordly.notes.menu.delete')}
          onClick={onDelete}
          danger
        />
      </div>
    );
  }),
);
