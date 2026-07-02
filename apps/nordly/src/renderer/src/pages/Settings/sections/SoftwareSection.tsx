import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  checkForUpdate,
  compareSemver,
  fetchPublishedVersion,
  isTauriRuntime,
  readAppVersion,
  type UpdatePhase,
} from '@shared/lib/updater';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { previewAllNotifications } from '@shared/lib/notificationPreview';
import { patchSettings, readSettings } from '@shared/model/settings';

import { SettingRow, SettingsGroup } from '../primitives/SettingRow';
import { Toggle } from '../primitives/Toggle';

function formatVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

export function SoftwareSection() {
  const t = useT();
  const [version, setVersion] = useState('…');
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(() => readSettings().autoUpdate);
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [status, setStatus] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const desktop = isTauriRuntime();

  const refreshPublished = useCallback(() => {
    if (!desktop) return;
    void fetchPublishedVersion().then(setPublishedVersion);
  }, [desktop]);

  useEffect(() => {
    if (!desktop) {
      setVersion('dev');
      return;
    }
    void readAppVersion().then(setVersion);
    refreshPublished();
  }, [desktop, refreshPublished]);

  useEffect(() => {
    const onUpdateAvailable = (event: Event): void => {
      const detail = (event as CustomEvent<{ published?: string }>).detail;
      if (detail?.published) {
        setPublishedVersion(detail.published);
        return;
      }
      refreshPublished();
    };
    window.addEventListener(NORDLY_EVENTS.updateAvailable, onUpdateAvailable);
    return () => window.removeEventListener(NORDLY_EVENTS.updateAvailable, onUpdateAvailable);
  }, [refreshPublished]);

  useEffect(() => {
    const onSettingsChanged = (): void => setAutoUpdate(readSettings().autoUpdate);
    window.addEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
    return () => window.removeEventListener(NORDLY_EVENTS.settingsChanged, onSettingsChanged);
  }, []);

  const updateReady =
    desktop &&
    publishedVersion &&
    version !== '…' &&
    compareSemver(publishedVersion, version) > 0;

  const versionHint = updateReady
    ? t('nordly.settings.update.version_available', {
        version: formatVersion(version),
        published: formatVersion(publishedVersion!),
      })
    : t('nordly.settings.update.version', { version: formatVersion(version) });

  const handleCheck = useCallback(async () => {
    if (!desktop || phase !== 'idle') return;
    setStatus(null);

    const result = await checkForUpdate(setPhase);
    if (result.kind === 'unavailable') {
      setStatus(t('nordly.settings.update.unavailable'));
      return;
    }
    if (result.kind === 'up_to_date') {
      refreshPublished();
      setStatus(t('nordly.settings.update.up_to_date'));
      return;
    }
    if (result.kind === 'error') {
      if (result.code === 'no_release') {
        setStatus(t('nordly.settings.update.no_release'));
      } else if (result.code === 'network') {
        setStatus(t('nordly.settings.update.network_error'));
      } else if (result.message.includes('published') && result.message.includes('updater returned none')) {
        setStatus(t('nordly.settings.update.version_mismatch'));
      } else {
        setStatus(t('nordly.settings.update.error', { message: result.message }));
      }
      return;
    }
    setStatus(t('nordly.settings.update.installed', { version: formatVersion(result.version) }));
  }, [desktop, phase, refreshPublished, t]);

  const handleAutoUpdateChange = useCallback((next: boolean) => {
    setAutoUpdate(next);
    patchSettings({ autoUpdate: next });
  }, []);

  const handlePreviewNotifications = useCallback(async () => {
    if (previewBusy) return;
    setPreviewBusy(true);
    setPreviewStatus(null);
    try {
      await previewAllNotifications((current, total) => {
        setPreviewStatus(t('nordly.settings.update.preview_running', { current, total }));
      });
      setPreviewStatus(null);
    } catch (err) {
      setPreviewStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewBusy(false);
    }
  }, [previewBusy, t]);

  const busy = phase !== 'idle';
  const buttonLabel =
    phase === 'checking'
      ? t('nordly.settings.update.checking')
      : phase === 'downloading'
        ? t('nordly.settings.update.downloading')
        : phase === 'installing' || phase === 'relaunching'
          ? t('nordly.settings.update.installing')
          : t('nordly.settings.update.check');

  return (
    <SettingsGroup title={t('nordly.settings.section.software')}>
      <SettingRow label={t('nordly.settings.update.label')} hint={versionHint}>
        <div className="nordly-settings-update">
          {updateReady ? (
            <span className="nordly-settings-update__badge">
              {t('nordly.settings.update.badge', { published: formatVersion(publishedVersion!) })}
            </span>
          ) : null}
          <button
            type="button"
            className="nordly-settings-update__btn"
            onClick={() => void handleCheck()}
            disabled={!desktop || busy}
            data-update-ready={updateReady ? 'true' : undefined}
          >
            {buttonLabel}
          </button>
          {status ? <p className="nordly-settings-update__status">{status}</p> : null}
        </div>
      </SettingRow>
      <SettingRow
        label={t('nordly.settings.update.auto_label')}
        hint={t('nordly.settings.update.auto_hint')}
      >
        <Toggle
          value={autoUpdate}
          onChange={handleAutoUpdateChange}
          label={autoUpdate ? t('nordly.settings.update.auto_on') : t('nordly.settings.update.auto_off')}
          disabled={!desktop}
        />
      </SettingRow>
      <SettingRow
        label={t('nordly.settings.update.preview_notifications')}
        hint={t('nordly.settings.update.preview_hint')}
      >
        <div className="nordly-settings-update">
          <button
            type="button"
            className="nordly-settings-update__btn nordly-settings-update__btn--preview"
            onClick={() => void handlePreviewNotifications()}
            disabled={previewBusy}
          >
            {previewBusy
              ? t('nordly.settings.update.preview_busy')
              : t('nordly.settings.update.preview_notifications')}
          </button>
          {previewStatus ? <p className="nordly-settings-update__status">{previewStatus}</p> : null}
        </div>
      </SettingRow>
    </SettingsGroup>
  );
}
