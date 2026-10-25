import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@nordly-i18n';
import { useDialogSurface } from '@shared/hooks/useDialogSurface';

export default function NotesSyntaxHelp({ onClose }: { onClose: () => void }) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogSurface(ref, onClose);
  const rows = [
    [t('nordly.slash.h1.label'), '# …'],
    [t('nordly.slash.h2.label'), '## …'],
    [t('nordly.slash.h3.label'), '### …'],
    ['Markdown', '**…**   *…*   ~~…~~   `…`'],
    [t('nordly.slash.bullet.label'), '- …\n1. …'],
    [t('nordly.slash.todo.label'), '- [ ] …\n- [x] …'],
    [t('nordly.slash.quote.label'), '> …'],
    [t('nordly.slash.divider.label'), '---'],
    [t('nordly.slash.code.label'), '```go\nfmt.Println("…")\n```'],
    ['Markdown', '[…](https://example.com)\n![…](img/example.png)'],
    [t('nordly.notes.sidebar_title'), '[[…]]   [[board:…]]'],
    [t('nordly.cards.title'), '… :: …\n… ::: …'],
  ];
  return createPortal(<div className="nordly-vault-modal-backdrop" onClick={onClose}>
    <div ref={ref} className="nordly-vault-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}
      tabIndex={-1} onClick={(event) => event.stopPropagation()} style={{ width: 'min(540px, 100%)', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <h2 id={titleId} className="nordly-vault-modal__title" style={{ margin: 0 }}>{t('nordly.notes.syntax_help')}</h2>
        <button type="button" className="nordly-icon-btn focus-ring" onClick={onClose} aria-label={t('nordly.sync.reauth_close')}><span aria-hidden="true">×</span></button>
      </div>
      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) 2fr', gap: '12px 20px', alignItems: 'start', fontSize: 12 }}>
        {rows.map(([label, syntax], index) => <div key={index} style={{ display: 'contents' }}>
          <dt style={{ color: 'var(--ink-60)' }}>{label}</dt>
          <dd style={{ margin: 0 }}><pre className="mono" style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--ink)' }}>{syntax}</pre></dd>
        </div>)}
      </dl>
    </div>
  </div>, document.body);
}
