import { useMemo } from 'react';

import { useT } from '@nordly-i18n';

import { isTauriRuntime } from '@shared/lib/updater';
import { SettingsBlock } from '../primitives/SettingRow';

interface Shortcut {
  labelKey: string;
  keys: string[];
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
    { labelKey: 'nordly.settings.shortcuts.notes_zoom_in', keys: [mod, '+'] },
    { labelKey: 'nordly.settings.shortcuts.notes_zoom_out', keys: [mod, '−'] },
    { labelKey: 'nordly.settings.shortcuts.notes_zoom_reset', keys: [mod, '0'] },
    { labelKey: 'nordly.settings.shortcuts.notes_select_all', keys: [mod, 'A'] },
    { labelKey: 'nordly.settings.shortcuts.notes_delete', keys: ['⌫'] },
    { labelKey: 'nordly.settings.shortcuts.notes_move_selection', keys: ['↑', '↓'] },
  ];
}

export function ShortcutsSection() {
  const t = useT();

  const mod = useMemo(() => {
    const isMac =
      isTauriRuntime() &&
      typeof navigator !== 'undefined' &&
      /mac/i.test(navigator.platform || navigator.userAgent);
    return isMac ? '\u2318' : 'Ctrl';
  }, []);

  const appShortcuts = useMemo(() => buildAppShortcuts(mod), [mod]);

  return (
    <SettingsBlock title={t('nordly.settings.shortcuts.in_app')}>
      <div className="nordly-shortcuts-card">
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
    </SettingsBlock>
  );
}
