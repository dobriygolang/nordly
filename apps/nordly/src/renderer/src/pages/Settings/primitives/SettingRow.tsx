import { memo, type ReactNode } from 'react';

interface SettingRowProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export const SettingRow = memo(function SettingRow({ label, hint, children }: SettingRowProps) {
  return (
    <div className="nordly-setting-row">
      <div className="nordly-setting-row__meta">
        <div className="nordly-setting-row__label">{label}</div>
        {hint ? <div className="nordly-setting-row__hint">{hint}</div> : null}
      </div>
      <div className="nordly-setting-row__control">{children}</div>
    </div>
  );
});

interface SettingsGroupProps {
  title: string;
  children: ReactNode;
}

export const SettingsGroup = memo(function SettingsGroup({ title, children }: SettingsGroupProps) {
  return (
    <section className="nordly-settings-group">
      <h2 className="nordly-settings-group__title">{title}</h2>
      <div className="nordly-settings-group__body">{children}</div>
    </section>
  );
});
