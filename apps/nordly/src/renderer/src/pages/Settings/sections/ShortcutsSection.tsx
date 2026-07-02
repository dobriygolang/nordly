import { useMemo } from 'react';

import { useT } from '@nordly-i18n';

import { isTauriRuntime } from '@shared/lib/updater';

interface Shortcut {
  labelKey: string;
  keys: string[];
}

/** Mirrors the bindings in `useGlobalHotkeys`. Keep in sync when hotkeys change. */
function buildShortcuts(mod: string): Shortcut[] {
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
  const mod = useMemo(() => {
    const isMac =
      isTauriRuntime() &&
      typeof navigator !== 'undefined' &&
      /mac/i.test(navigator.platform || navigator.userAgent);
    return isMac ? '\u2318' : 'Ctrl';
  }, []);

  const shortcuts = useMemo(() => buildShortcuts(mod), [mod]);

  return (
    <div className="nordly-shortcuts-list">
      {shortcuts.map((s) => (
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
  );
}
