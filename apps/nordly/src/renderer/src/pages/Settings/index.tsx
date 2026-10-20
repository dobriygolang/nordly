import { useEffect, useState } from 'react';

import { useT } from '@nordly-i18n';

import { Icon, type IconName } from '@shared/ui/primitives/Icon';
import type { ThemeId } from '@shared/model/theme';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import type { TimerMode } from '@shared/model/settings';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import {
  SettingsSectionId,
  takeSettingsDetail,
  type SettingsHighlightId,
  type SettingsSectionId as SectionId,
} from '@shared/model/settingsNav';

import { GeneralSection } from './sections/GeneralSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { SignOutSection } from './sections/SignOutSection';
import { SoftwareSection } from './sections/SoftwareSection';
import { FilesAndLinksSection } from './sections/FilesAndLinksSection';
import { SyncSection } from './sections/SyncSection';

interface NavItem {
  id: SectionId;
  icon: IconName;
  labelKey: string;
}

const NAV: NavItem[] = [
  { id: SettingsSectionId.General, icon: 'settings', labelKey: 'nordly.settings.nav.general' },
  { id: SettingsSectionId.Integrations, icon: 'link', labelKey: 'nordly.settings.nav.integrations' },
  { id: SettingsSectionId.FilesLinks, icon: 'folder', labelKey: 'nordly.settings.nav.files_links' },
  { id: SettingsSectionId.Sync, icon: 'lock', labelKey: 'nordly.settings.nav.sync' },
  { id: SettingsSectionId.Shortcuts, icon: 'command', labelKey: 'nordly.settings.nav.shortcuts' },
  { id: SettingsSectionId.About, icon: 'info', labelKey: 'nordly.settings.nav.about' },
];

interface SettingsPageProps {
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  boardCanvas: BoardCanvasTheme;
  onBoardCanvasChange: (t: BoardCanvasTheme) => void;
  onPomoChange?: (secs: number) => void;
  onTimerModeChange?: (mode: TimerMode) => void;
  onBack?: () => void;
}

export function SettingsPage(props: SettingsPageProps) {
  const t = useT();
  const opened = useState(() => takeSettingsDetail())[0];
  const [section, setSection] = useState<SectionId>(opened?.section ?? SettingsSectionId.General);
  const [highlight, setHighlight] = useState<SettingsHighlightId | null>(opened?.highlight ?? null);

  useEffect(() => {
    const onOpen = (): void => {
      const detail = takeSettingsDetail();
      if (!detail) return;
      if (detail.section) setSection(detail.section);
      setHighlight(detail.highlight ?? null);
    };
    window.addEventListener(NORDLY_EVENTS.openSettings, onOpen);
    return () => window.removeEventListener(NORDLY_EVENTS.openSettings, onOpen);
  }, []);

  return (
    <div className="nordly-settings-shell">
      <nav className="nordly-settings-nav" aria-label={t('nordly.settings.heading')}>
        <button
          type="button"
          className="nordly-settings-nav__back focus-ring"
          onClick={props.onBack}
          disabled={!props.onBack}
        >
          <Icon name="chevron-left" size={13} />
          <span className="mono">{t('nordly.settings.eyebrow').toUpperCase()}</span>
        </button>

        <ul className="nordly-settings-nav__list">
          {NAV.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`nordly-settings-nav__item${section === item.id ? ' is-active' : ''} focus-ring`}
                aria-current={section === item.id}
                onClick={() => {
                  setHighlight(null);
                  setSection(item.id);
                }}
              >
                <Icon name={item.icon} size={15} />
                <span>{t(item.labelKey)}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="nordly-settings-content">
        <div className="nordly-settings-content__inner">
          {section === SettingsSectionId.General && <GeneralSection {...props} />}

          {section === SettingsSectionId.Integrations && (
            <>
              <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.integrations')}</h1>
              <IntegrationsSection />
            </>
          )}

          {section === SettingsSectionId.FilesLinks && (
            <>
              <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.files_links')}</h1>
              <FilesAndLinksSection />
            </>
          )}


          {section === SettingsSectionId.Sync && (
            <>
              <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.sync')}</h1>
              <SyncSection highlight={highlight} />
            </>
          )}

          {section === SettingsSectionId.Shortcuts && (
            <>
              <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.shortcuts')}</h1>
              <ShortcutsSection />
            </>
          )}

          {section === SettingsSectionId.About && (
            <>
              <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.about')}</h1>
              <SoftwareSection />
              <SignOutSection />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
