import { useT } from '@nordly-i18n';

interface NotesSidebarDividerProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function NotesSidebarDivider({ collapsed, onToggle }: NotesSidebarDividerProps): JSX.Element {
  const t = useT();
  return (
    <button
      type="button"
      className="nordly-notes-divider"
      aria-label={t('nordly.sidebar.hide')}
      title={t('nordly.sidebar.hide')}
      onClick={onToggle}
      style={{
        position: 'relative',
        flexShrink: 0,
        width: collapsed ? 0 : 6,
        opacity: collapsed ? 0 : 1,
        padding: 0,
        border: 'none',
        background: 'transparent',
        cursor: collapsed ? 'default' : 'col-resize',
        pointerEvents: collapsed ? 'none' : 'auto',
        overflow: 'hidden',
        WebkitAppRegion: 'no-drag',
      }}
    >
      <span
        className="nordly-notes-divider__line"
        style={{
          position: 'absolute',
          left: '50%',
          top: 0,
          bottom: 0,
          width: 1,
          transform: 'translateX(-50%)',
        }}
      />
    </button>
  );
}

/** Left-edge hit zone — expand sidebar when collapsed (Notion-style). */
export function NotesSidebarEdge({ onExpand }: { onExpand: () => void }): JSX.Element {
  const t = useT();
  return (
    <button
      type="button"
      className="nordly-notes-edge"
      aria-label={t('nordly.sidebar.show')}
      title={t('nordly.sidebar.show')}
      onClick={onExpand}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 14,
        padding: 0,
        border: 'none',
        cursor: 'pointer',
        zIndex: 20,
        display: 'grid',
        placeItems: 'center',
        WebkitAppRegion: 'no-drag',
      }}
    >
      <span
        aria-hidden
        className="nordly-notes-edge__handle"
        style={{
          width: 2,
          borderRadius: 99,
        }}
      />
    </button>
  );
}
