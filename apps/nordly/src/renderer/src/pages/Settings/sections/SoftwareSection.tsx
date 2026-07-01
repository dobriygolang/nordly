import { useCallback, useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  checkForUpdate,
  isTauriRuntime,
  readAppVersion,
  type UpdatePhase,
} from '@shared/lib/updater';

import { SettingRow, SettingsGroup } from '../primitives/SettingRow';

function formatVersion(version: string): string {
  return version.startsWith('v') ? version : `v${version}`;
}

export function SoftwareSection() {
  const t = useT();
  const [version, setVersion] = useState('…');
  const [phase, setPhase] = useState<UpdatePhase>('idle');
  const [status, setStatus] = useState<string | null>(null);
  const desktop = isTauriRuntime();

  useEffect(() => {
    if (!desktop) {
      setVersion('dev');
      return;
    }
    void readAppVersion().then((v) => setVersion(v));
  }, [desktop]);

  const handleCheck = useCallback(async () => {
    if (!desktop || phase !== 'idle') return;
    setStatus(null);

    const result = await checkForUpdate(setPhase);
    if (result.kind === 'unavailable') {
      setStatus(t('nordly.settings.update.unavailable'));
      return;
    }
    if (result.kind === 'up_to_date') {
      setStatus(t('nordly.settings.update.up_to_date'));
      return;
    }
    if (result.kind === 'error') {
      if (result.code === 'no_release') {
        setStatus(t('nordly.settings.update.no_release'));
      } else if (result.code === 'network') {
        setStatus(t('nordly.settings.update.network_error'));
      } else {
        setStatus(t('nordly.settings.update.error', { message: result.message }));
      }
      return;
    }
    // relaunch() usually exits before this line runs
    setStatus(t('nordly.settings.update.installed', { version: formatVersion(result.version) }));
  }, [desktop, phase, t]);

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
      <SettingRow
        label={t('nordly.settings.update.label')}
        hint={t('nordly.settings.update.version', { version: formatVersion(version) })}
      >
        <div className="nordly-settings-update">
          <button
            type="button"
            className="nordly-settings-update__btn"
            onClick={() => void handleCheck()}
            disabled={!desktop || busy}
          >
            {buttonLabel}
          </button>
          {status ? <p className="nordly-settings-update__status">{status}</p> : null}
        </div>
      </SettingRow>
    </SettingsGroup>
  );
}
