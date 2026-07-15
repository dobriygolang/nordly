import { useT } from '@nordly-i18n';

export function FileDropOverlay({ active }: { active: boolean }) {
  const t = useT();
  return (
    <div
      className="nordly-vault-file-drop"
      data-active={active ? 'true' : 'false'}
      aria-hidden={active ? undefined : true}
    >
      <div className="nordly-vault-file-drop__hint">{t('nordly.notes.file_drop.hint')}</div>
    </div>
  );
}
