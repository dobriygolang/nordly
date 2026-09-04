import { useState } from 'react';

import { useT } from '@nordly-i18n';

import { Icon, type IconName } from '@shared/ui/primitives/Icon';
import type { ThemeId } from '@shared/model/theme';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import type { TimerMode } from '@shared/model/settings';

import { GeneralSection } from './sections/GeneralSection';
import { IntegrationsSection } from './sections/IntegrationsSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { SignOutSection } from './sections/SignOutSection';
import { SoftwareSection } from './sections/SoftwareSection';
import { VaultSection } from './sections/VaultSection';
import { FilesAndLinksSection } from './sections/FilesAndLinksSection';

const SectionId = {
  General: 'general',
  Integrations: 'integrations',
  FilesLinks: 'files_links',
  Vault: 'vault',
  Shortcuts: 'shortcuts',
  About: 'about',
} as const;
type SectionId = (typeof SectionId)[keyof typeof SectionId];

interface NavItem {
  id: SectionId;
  icon: IconName;
  labelKey: string;
}

const NAV: NavItem[] = [
  { id: SectionId.General, icon: 'settings', labelKey: 'nordly.settings.nav.general' },
  { id: SectionId.Integrations, icon: 'link', labelKey: 'nordly.settings.nav.integrations' },
  { id: SectionId.FilesLinks, icon: 'folder', labelKey: 'nordly.settings.nav.files_links' },
  { id: SectionId.Vault, icon: 'lock', labelKey: 'nordly.settings.nav.vault' },
  { id: SectionId.Shortcuts, icon: 'command', labelKey: 'nordly.settings.nav.shortcuts' },
  { id: SectionId.About, icon: 'info', labelKey: 'nordly.settings.nav.about' },
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
  const [section, setSection] = useState<SectionId>(SectionId.General);

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
                onClick={() => setSection(item.id)}
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
          {section === SectionId.General && <GeneralSection {...props} />}

          {section === SectionId.Integrations && (
            <>
              <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.integrations')}</h1>
              <IntegrationsSection />
            </>
          )}

          {section === SectionId.FilesLinks && (
            <>
              <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.files_links')}</h1>
              <FilesAndLinksSection />
            </>
          )}


          {section === SectionId.Vault && (
            <>
              <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.vault')}</h1>
              <VaultSection />
            </>
          )}

          {section === SectionId.Shortcuts && (
            <>
              <h1 className="nordly-settings-content__title">{t('nordly.settings.nav.shortcuts')}</h1>
              <ShortcutsSection />
            </>
          )}

          {section === SectionId.About && (
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
