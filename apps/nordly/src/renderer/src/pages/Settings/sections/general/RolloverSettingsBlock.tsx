import { useT } from '@nordly-i18n';

import { getUserTimeZone } from '@shared/lib/localeFormat';
import type { NordlySettings } from '@shared/model/settings';
import { SettingRow, SettingsBlock } from '../../primitives/SettingRow';
import { Toggle } from '../../primitives/Toggle';

interface RolloverSettingsBlockProps {
  settings: NordlySettings;
  update: (patch: Partial<NordlySettings>) => void;
}

export function RolloverSettingsBlock({
  settings,
  update,
}: RolloverSettingsBlockProps): JSX.Element {
  const t = useT();
  const timeZone = getUserTimeZone();

  return (
    <SettingsBlock title={t('nordly.settings.section.rollover')}>
      <SettingRow
        label={t('nordly.settings.rollover.label')}
        hint={t('nordly.settings.rollover.hint')}
      >
        <div className="nordly-settings-rollover-control">
          <Toggle
            value={settings.taskRollover}
            onChange={(taskRollover) => update({ taskRollover })}
            label={
              settings.taskRollover
                ? t('nordly.settings.notifications.on')
                : t('nordly.settings.notifications.off')
            }
          />
          <span className="mono nordly-settings-rollover-tz">
            {t('nordly.settings.rollover.timezone', { tz: timeZone })}
          </span>
        </div>
      </SettingRow>
    </SettingsBlock>
  );
}
