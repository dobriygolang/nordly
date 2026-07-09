import { useCallback, useMemo, useState } from 'react';

import { useT } from '@nordly-i18n';

import { applyQuickCaptureConfig } from '@features/quickCapture/lib/quickCaptureBridge';
import { formatQuickCaptureShortcutLabel } from '@features/quickCapture/lib/quickCaptureNote';
import { isTauriRuntime } from '@shared/lib/updater';
import {
  QUICK_CAPTURE_SHORTCUT_PRESETS,
  detectQuickCapturePreset,
  patchSettings,
  readSettings,
  resolveQuickCaptureShortcut,
  type NordlySettings,
  type QuickCaptureShortcutPreset,
} from '@shared/model/settings';
import { Toggle } from '../primitives/Toggle';
import { SettingRow, SettingsBlock } from '../primitives/SettingRow';

interface Shortcut {
  labelKey: string;
  keys: string[];
  global?: boolean;
}

/** Mirrors the bindings in `useGlobalHotkeys`. Keep in sync when hotkeys change. */
function buildAppShortcuts(mod: string): Shortcut[] {
  return [
    { labelKey: 'nordly.settings.shortcuts.spotlight', keys: [mod, 'K'] },
    { labelKey: 'nordly.settings.shortcuts.tasks', keys: ['T'] },
    { labelKey: 'nordly.settings.shortcuts.notes', keys: ['N'] },
    { labelKey: 'nordly.settings.shortcuts.whiteboard', keys: ['B'] },
    { labelKey: 'nordly.settings.shortcuts.stats', keys: ['S'] },
    { labelKey: 'nordly.settings.shortcuts.calendar', keys: ['C'] },
    { labelKey: 'nordly.settings.shortcuts.planning', keys: ['P'] },
    { labelKey: 'nordly.settings.shortcuts.sidebar', keys: [mod, 'S'] },
    { labelKey: 'nordly.settings.shortcuts.settings', keys: [','] },
    { labelKey: 'nordly.settings.shortcuts.home', keys: ['Esc'] },
  ];
}

export function ShortcutsSection() {
  const t = useT();
  const [settings, setSettings] = useState<NordlySettings>(() => readSettings());
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const mod = useMemo(() => {
    const isMac =
      isTauriRuntime() &&
      typeof navigator !== 'undefined' &&
      /mac/i.test(navigator.platform || navigator.userAgent);
    return isMac ? '\u2318' : 'Ctrl';
  }, []);

  const appShortcuts = useMemo(() => buildAppShortcuts(mod), [mod]);
  const quickCaptureKeys = useMemo(
    () => formatQuickCaptureShortcutLabel(settings.quickCaptureShortcut),
    [settings.quickCaptureShortcut],
  );
  const activePreset = useMemo(
    () => detectQuickCapturePreset(settings.quickCaptureShortcut),
    [settings.quickCaptureShortcut],
  );

  const syncRegistration = useCallback(async (next: NordlySettings) => {
    if (!isTauriRuntime()) {
      setRegistrationError(null);
      return;
    }
    const result = await applyQuickCaptureConfig(next);
    if (result.ok) {
      setRegistrationError(null);
      return;
    }
    setRegistrationError(result.error ?? t('nordly.settings.quick_capture.register_failed'));
  }, [t]);

  const update = useCallback(
    (patch: Partial<NordlySettings>) => {
      const next = patchSettings(patch);
      setSettings(next);
      if (
        patch.quickCaptureEnabled !== undefined ||
        patch.quickCaptureShortcut !== undefined
      ) {
        void syncRegistration(next);
      }
    },
    [syncRegistration],
  );

  const setPreset = useCallback(
    (preset: QuickCaptureShortcutPreset) => {
      update({
        quickCaptureShortcut: resolveQuickCaptureShortcut(preset),
      });
    },
    [update],
  );

  return (
    <>
      <SettingsBlock title={t('nordly.settings.quick_capture.section')}>
        <SettingRow
          label={t('nordly.settings.quick_capture.enabled')}
          hint={t('nordly.settings.quick_capture.enabled_desc')}
        >
          <Toggle
            value={settings.quickCaptureEnabled}
            onChange={(checked) => update({ quickCaptureEnabled: checked })}
            label={
              settings.quickCaptureEnabled
                ? t('nordly.settings.notifications.on')
                : t('nordly.settings.notifications.off')
            }
            disabled={!isTauriRuntime()}
          />
        </SettingRow>

        <div className="nordly-shortcuts-list">
          <div className="nordly-shortcut-row">
            <span className="nordly-shortcut-row__label">{t('nordly.settings.shortcuts.quick_capture')}</span>
            <span className="nordly-shortcut-row__keys">
              {quickCaptureKeys.map((k, i) => (
                <span className="nordly-kbd mono" key={`qc-${i}`}>
                  {k}
                </span>
              ))}
            </span>
          </div>
        </div>

        <div className="nordly-shortcuts-list__presets" role="radiogroup" aria-label={t('nordly.settings.quick_capture.preset_group')}>
          {(Object.keys(QUICK_CAPTURE_SHORTCUT_PRESETS) as QuickCaptureShortcutPreset[]).map((preset) => (
            <button
              key={preset}
              type="button"
              className="nordly-shortcuts-list__preset focus-ring"
              data-active={activePreset === preset ? 'true' : 'false'}
              onClick={() => setPreset(preset)}
              disabled={!settings.quickCaptureEnabled}
            >
              {t(QUICK_CAPTURE_SHORTCUT_PRESETS[preset].labelKey)}
            </button>
          ))}
        </div>

        <p className="nordly-shortcuts-list__note">{t('nordly.settings.quick_capture.note')}</p>
        {registrationError && <p className="nordly-shortcuts-list__error">{registrationError}</p>}
      </SettingsBlock>

      <div className="nordly-shortcuts-list__section">
        <h3 className="nordly-shortcuts-list__section-title">{t('nordly.settings.shortcuts.in_app')}</h3>
        <div className="nordly-shortcuts-list">
          {appShortcuts.map((s) => (
            <div className="nordly-shortcut-row" key={s.labelKey}>
              <span className="nordly-shortcut-row__label">{t(s.labelKey)}</span>
              <span className="nordly-shortcut-row__keys">
                {s.keys.map((k, i) => (
                  <span className="nordly-kbd mono" key={`${s.labelKey}-${i}`}>
                    {k}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
