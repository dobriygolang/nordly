import { useT } from '@nordly-i18n';

import type { NordlySettings } from '@shared/model/settings';
import { SettingRow, SettingsBlock } from '../../primitives/SettingRow';
import { Toggle } from '../../primitives/Toggle';

interface FlashcardsSettingsBlockProps {
  settings: NordlySettings;
  update: (patch: Partial<NordlySettings>) => void;
}

export function FlashcardsSettingsBlock({
  settings,
  update,
}: FlashcardsSettingsBlockProps): JSX.Element {
  const t = useT();
  const cards = settings.flashcards;

  return (
    <SettingsBlock title={t('nordly.settings.flashcards.title')}>
      <SettingRow label={t('nordly.settings.flashcards.label')} hint={t('nordly.settings.flashcards.hint')}>
        <Toggle
          value={cards.enabled}
          onChange={(enabled) => update({ flashcards: { ...cards, enabled } })}
          label={
            cards.enabled ? t('nordly.settings.notifications.on') : t('nordly.settings.notifications.off')
          }
        />
      </SettingRow>
      <SettingRow
        label={t('nordly.settings.flashcards.daily_limit')}
        hint={t('nordly.settings.flashcards.daily_limit_hint')}
      >
        <input
          className="nordly-settings-number"
          type="number"
          aria-label={t('nordly.settings.flashcards.daily_limit')}
          min={1}
          max={100}
          step={1}
          value={cards.dailyNewLimit}
          disabled={!cards.enabled}
          onChange={(event) => {
            const dailyNewLimit = Number(event.target.value);
            if (!Number.isInteger(dailyNewLimit) || dailyNewLimit < 1 || dailyNewLimit > 100) return;
            update({ flashcards: { ...cards, dailyNewLimit } });
          }}
        />
      </SettingRow>
    </SettingsBlock>
  );
}
