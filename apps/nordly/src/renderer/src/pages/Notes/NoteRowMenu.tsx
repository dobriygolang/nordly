import { forwardRef, memo, useCallback } from 'react';

import { useT } from '@nordly-i18n';

import {
  canApplyPublishOptions,
  type PublishFeatureEntitlements,
  type PublishToWebOptions,
} from '@features/notes/model/publishOptions';
import { PUBLISH_EXPIRY_OPTIONS } from '@features/notes/model/publishOptions';
import { Icon } from '@shared/ui/primitives/Icon';

export interface NoteRowMenuProps {
  published: boolean;
  publishingAvailable: boolean;
  vaultReady: boolean;
  publishOptions: PublishToWebOptions;
  publishEntitlements: PublishFeatureEntitlements | null;
  serverPasswordProtected: boolean;
  style?: React.CSSProperties;
  onPublishOptionsChange: (patch: Partial<PublishToWebOptions>) => void;
  onPublish: () => void;
  onCopyLink: () => void;
  onViewPublic: () => void;
  onUnpublish: () => void;
  onDelete: () => void;
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
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
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
  publishEntitlements,
  onPublishOptionsChange,
}: {
  publishOptions: PublishToWebOptions;
  publishEntitlements: PublishFeatureEntitlements;
  onPublishOptionsChange: (patch: Partial<PublishToWebOptions>) => void;
}) {
  const t = useT();
  if (!publishEntitlements.publishPrivateLink) return null;

  return (
    <div className="nordly-note-menu__options">
      <MenuToggle
        label={t('nordly.settings.features.entitlement.publish_password')}
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
            <span className="nordly-note-menu__expiry-select-wrap">
              <select
                className="nordly-note-menu__expiry-select mono"
                value={publishOptions.expiresInDays}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onPublishOptionsChange({ expiresInDays: Number(e.target.value) })}
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
      publishingAvailable,
      vaultReady,
      publishOptions,
      publishEntitlements,
      serverPasswordProtected,
      style,
      onPublishOptionsChange,
      onPublish,
      onCopyLink,
      onViewPublic,
      onUnpublish,
      onDelete,
    },
    ref,
  ) {
    const t = useT();
    const passwordInvalid = !canApplyPublishOptions(publishOptions, serverPasswordProtected);
    const proOptions = publishEntitlements?.publishPrivateLink;

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
          <>
            <div className="nordly-note-menu__label mono">{t('nordly.notes.menu.publishing')}</div>
            {published ? (
              <>
                <MenuItem
                  icon={<Icon name="copy" size={14} strokeWidth={1.5} />}
                  label={t('nordly.notes.menu.copy_link')}
                  onClick={onCopyLink}
                />
                <MenuItem
                  icon={<Icon name="external" size={14} strokeWidth={1.5} />}
                  label={t('nordly.notes.menu.view_public')}
                  onClick={onViewPublic}
                />
                {proOptions ? (
                  <PublishOptionsSection
                    publishOptions={publishOptions}
                    publishEntitlements={publishEntitlements}
                    onPublishOptionsChange={onPublishOptionsChange}
                  />
                ) : null}
                <MenuItem
                  icon={<Icon name="unlink" size={14} strokeWidth={1.5} />}
                  label={t('nordly.notes.menu.unpublish')}
                  onClick={onUnpublish}
                  danger
                />
              </>
            ) : (
              <>
                {proOptions ? (
                  <PublishOptionsSection
                    publishOptions={publishOptions}
                    publishEntitlements={publishEntitlements}
                    onPublishOptionsChange={onPublishOptionsChange}
                  />
                ) : null}
                <MenuItem
                  icon={<Icon name="link" size={14} strokeWidth={1.5} />}
                  label={t('nordly.notes.menu.publish')}
                  onClick={onPublish}
                  disabled={!vaultReady || passwordInvalid}
                />
              </>
            )}
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
