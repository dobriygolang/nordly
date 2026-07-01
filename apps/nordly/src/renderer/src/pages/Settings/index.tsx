import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT, useLocale, type Locale } from '@nordly-i18n';

import { type ThemeId, THEME_IDS } from '@widgets/CanvasBg';
import { applyTextScale } from '@shared/model/accessibility';
import { readPomodoroSeconds as readPomodoroSecondsFromPrefs, readStoredTheme as readStoredThemeFromPrefs } from '@shared/model/prefs';
import { SignOutSection } from './sections/SignOutSection';
import { SoftwareSection } from './sections/SoftwareSection';
import { GoogleCalendarSection } from './sections/GoogleCalendarSection';
import { VaultSection } from './sections/VaultSection';
import {
  readSettings,
  SETTINGS_KEY,
  TEXT_SCALES,
  THEME_KEY,
  type NordlySettings,
  type TextScale,
} from './lib/settings-store';
import { SettingRow, SettingsGroup } from './primitives/SettingRow';
import { SegmentedControl } from './primitives/SegmentedControl';
import { Slider } from './primitives/Slider';
import { Toggle } from './primitives/Toggle';
import { ThemeCard } from './primitives/ThemeCard';

export const readPomodoroSeconds = readPomodoroSecondsFromPrefs;
export const readStoredTheme = readStoredThemeFromPrefs;

interface SettingsPageProps {
  theme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  onPomoChange?: (secs: number) => void;
}

const LOCALES: Locale[] = ['ru', 'en'];

export function SettingsPage({ theme, onThemeChange, onPomoChange }: SettingsPageProps) {
  const t = useT();
  const [locale, setLocale] = useLocale();
  const [settings, setSettings] = useState<NordlySettings>(() => readSettings());

  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    applyTextScale(settings.textScale);
  }, [settings]);

  const setPomo = useCallback(
    (n: number) => {
      setSettings((s) => ({ ...s, pomodoroMinutes: n }));
      onPomoChange?.(n * 60);
    },
    [onPomoChange],
  );

  const setNotif = useCallback((b: boolean) => setSettings((s) => ({ ...s, notifications: b })), []);

  const setTextScale = useCallback((scale: TextScale) => {
    setSettings((s) => ({ ...s, textScale: scale }));
  }, []);

  const pickTheme = useCallback(
    (id: ThemeId) => {
      onThemeChange(id);
      try {
        window.localStorage.setItem(THEME_KEY, id);
      } catch {
        /* ignore */
      }
    },
    [onThemeChange],
  );

  const localeOptions = useMemo(
    () =>
      LOCALES.map((l) => ({
        value: l,
        label: l === 'ru' ? t('common.lang.ru') : t('common.lang.en'),
      })),
    [t],
  );

  const textScaleOptions = useMemo(
    () =>
      TEXT_SCALES.map((scale) => ({
        value: scale,
        label:
          scale === 'normal'
            ? t('nordly.settings.text_scale.normal')
            : scale === 'large'
              ? t('nordly.settings.text_scale.large')
              : t('nordly.settings.text_scale.xlarge'),
      })),
    [t],
  );

  return (
    <div className="nordly-settings-page">
      <div className="nordly-settings-page__inner">
        <p className="nordly-settings-page__eyebrow mono">{t('nordly.settings.eyebrow').toUpperCase()}</p>
        <h1 className="nordly-settings-page__title">{t('nordly.settings.heading')}</h1>

        <SettingsGroup title={t('nordly.settings.section.appearance')}>
          <SettingRow label={t('nordly.settings.language.label')} hint={t('nordly.settings.language.hint')}>
            <SegmentedControl
              ariaLabel={t('nordly.settings.language.label')}
              value={locale}
              options={localeOptions}
              onChange={setLocale}
            />
          </SettingRow>

          <SettingRow label={t('nordly.settings.text_scale.label')} hint={t('nordly.settings.text_scale.hint')}>
            <SegmentedControl
              ariaLabel={t('nordly.settings.text_scale.label')}
              value={settings.textScale}
              options={textScaleOptions}
              onChange={setTextScale}
            />
          </SettingRow>

          <SettingRow label={t('nordly.settings.theme.label')} hint={t('nordly.settings.theme.hint')}>
            <div className="nordly-settings-theme-grid">
              {THEME_IDS.map((id) => (
                <ThemeCard key={id} id={id} active={theme === id} onPick={() => pickTheme(id)} />
              ))}
            </div>
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title={t('nordly.settings.section.focus')}>
          <SettingRow label={t('nordly.settings.pomodoro.label')} hint={t('nordly.settings.pomodoro.hint')}>
            <Slider
              min={5}
              max={90}
              step={5}
              value={settings.pomodoroMinutes}
              onChange={setPomo}
              unit={t('nordly.settings.pomodoro.unit')}
            />
          </SettingRow>

          <SettingRow label={t('nordly.settings.notifications.label')} hint={t('nordly.settings.notifications.hint')}>
            <Toggle
              value={settings.notifications}
              onChange={setNotif}
              label={settings.notifications ? t('nordly.settings.notifications.on') : t('nordly.settings.notifications.off')}
            />
          </SettingRow>
        </SettingsGroup>

        <SettingsGroup title={t('nordly.settings.section.integrations')}>
          <GoogleCalendarSection />
        </SettingsGroup>

        <VaultSection />

        <SoftwareSection />

        <SettingsGroup title={t('nordly.settings.section.account')}>
          <SignOutSection />
        </SettingsGroup>
      </div>
    </div>
  );
}
