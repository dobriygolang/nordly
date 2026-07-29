import { useState } from 'react';

import { useT } from '@nordly-i18n';

import { isMacOsDesktop } from '@platform/macos';
import {
  isCloudEnabled,
  isGoogleIntegrationAvailable,
  isZoomIntegrationAvailable,
} from '@shared/model/features';
import { patchSettings, readSettings, type GoogleCalendarPollMinutes } from '@shared/model/settings';

import { SettingsBlock } from '../primitives/SettingRow';
import { AppleCalendarSection } from './AppleCalendarSection';
import { GoogleCalendarSection } from './GoogleCalendarSection';
import { ZoomSection } from './ZoomSection';

export function IntegrationsSection() {
  const t = useT();
  const [pollMinutes, setPollMinutes] = useState<GoogleCalendarPollMinutes>(
    () => readSettings().googleCalendarPollMinutes,
  );
  const showApple = isMacOsDesktop();
  const showGoogle = isGoogleIntegrationAvailable();
  const showZoom = isZoomIntegrationAvailable();
  const showDeviceIntegrations = showGoogle || showZoom;

  if (!showApple && !showDeviceIntegrations && !isCloudEnabled()) {
    return <p className="nordly-settings-empty">{t('nordly.settings.integrations_local_only')}</p>;
  }

  return (
    <>
      {showApple && (
        <SettingsBlock title={t('nordly.settings.section.apple_calendar')}>
          <AppleCalendarSection />
        </SettingsBlock>
      )}
      {showDeviceIntegrations ? (
        <SettingsBlock title={t('nordly.settings.section.integrations')}>
          {showGoogle && (
            <GoogleCalendarSection
              pollMinutes={pollMinutes}
              onPollMinutesChange={(m) => {
                patchSettings({ googleCalendarPollMinutes: m });
                setPollMinutes(m);
              }}
            />
          )}
          {showZoom && <ZoomSection />}
        </SettingsBlock>
      ) : (
        !showApple && (
          <p className="nordly-settings-empty">{t('nordly.settings.integrations_cloud_only')}</p>
        )
      )}
    </>
  );
}
