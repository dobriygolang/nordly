import { useState } from 'react';

import { useT } from '@nordly-i18n';

import { isCloudEnabled } from '@shared/model/features';
import { patchSettings, readSettings, type GoogleCalendarPollMinutes } from '@shared/model/settings';

import { SettingsBlock } from '../primitives/SettingRow';
import { GoogleCalendarSection } from './GoogleCalendarSection';
import { ZoomSection } from './ZoomSection';

export function IntegrationsSection() {
  const t = useT();
  const [pollMinutes, setPollMinutes] = useState<GoogleCalendarPollMinutes>(
    () => readSettings().googleCalendarPollMinutes,
  );

  if (!isCloudEnabled()) {
    return <p className="nordly-settings-empty">{t('nordly.settings.integrations_local_only')}</p>;
  }

  return (
    <SettingsBlock title={t('nordly.settings.section.integrations')}>
      <GoogleCalendarSection
        pollMinutes={pollMinutes}
        onPollMinutesChange={(m) => {
          patchSettings({ googleCalendarPollMinutes: m });
          setPollMinutes(m);
        }}
      />
      <ZoomSection />
    </SettingsBlock>
  );
}
