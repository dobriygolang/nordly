import { useState } from 'react';

import { useT } from '@nordly-i18n';

import { isMacOsDesktop } from '@platform/macos';
import { isTauriRuntime } from '@platform/runtime';
import { isCloudEnabled } from '@shared/model/features';
import { patchSettings, readSettings, type GoogleCalendarPollMinutes } from '@shared/model/settings';

import { SettingsBlock } from '../primitives/SettingRow';
import { AppleCalendarSection } from './AppleCalendarSection';

import { GoogleCalendarSection } from './GoogleCalendarSection';
import { CaptureSection } from './CaptureSection';
import { SpotifySection } from './SpotifySection';
import { ZoomSection } from './ZoomSection';

export function IntegrationsSection() {
  const t = useT();
  const [pollMinutes, setPollMinutes] = useState<GoogleCalendarPollMinutes>(
    () => readSettings().googleCalendarPollMinutes,
  );
  const showApple = isMacOsDesktop();
  const showCloud = isCloudEnabled();
  const showSpotify = isTauriRuntime();
  const showBrowser = isTauriRuntime();

  if (!showApple && !showCloud && !showSpotify && !showBrowser) {
    return <p className="nordly-settings-empty">{t('nordly.settings.integrations_local_only')}</p>;
  }

  return (
    <>
      {showApple && (
        <SettingsBlock title={t('nordly.settings.section.apple_calendar')}>
          <AppleCalendarSection />
        </SettingsBlock>
      )}
      {showCloud ? (
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
      ) : (
        <p className="nordly-settings-empty">{t('nordly.settings.integrations_cloud_only')}</p>
      )}
      {showSpotify ? (
        <SettingsBlock title={t('nordly.settings.section.spotify')}>
          <SpotifySection />
        </SettingsBlock>
      ) : null}
      {showBrowser ? (
        <SettingsBlock title={t('nordly.settings.section.browser')}>
          <CaptureSection />
        </SettingsBlock>
      ) : null}
    </>
  );
}
