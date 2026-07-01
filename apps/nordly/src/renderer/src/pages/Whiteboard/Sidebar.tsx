import { memo } from 'react';

import { useT } from '@nordly-i18n';

import { Icon } from '@shared/ui/primitives/Icon';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

import { BoardRow } from './BoardRow';
import { type ListState } from './utils';

export interface SidebarProps {
  list: ListState;
  selectedId: string | null;
  cloudEnabled: boolean;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onShare: () => void;
  onPublish: () => void;
  onDelete: (id: string) => Promise<void>;
}

export const Sidebar = memo(function Sidebar({
  list,
  selectedId,
  cloudEnabled,
  onSelect,
  onCreate,
  onShare,
  onPublish,
  onDelete,
}: SidebarProps) {
  const t = useT();
  return (
    <aside className="nordly-vault-sidebar">
      <div className="nordly-vault-sidebar__toolbar">
        <button
          type="button"
          className="nordly-vault-sidebar__btn nordly-icon-btn"
          title={t('nordly.notes.back')}
          onClick={() => window.dispatchEvent(new Event(NORDLY_EVENTS.navHome))}
        >
          <Icon name="chevron-left" size={16} strokeWidth={1.6} />
        </button>
        <span className="nordly-vault-sidebar__label">{t('nordly.whiteboard.sidebar_title')}</span>
        <button
          type="button"
          className="nordly-vault-sidebar__btn nordly-icon-btn"
          title={t('nordly.whiteboard.new')}
          onClick={onCreate}
        >
          <Icon name="plus" size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="nordly-vault-sidebar__list">
        {list.boards.map((b) => (
          <BoardRow
            key={b.id}
            board={b}
            active={selectedId === b.id}
            cloudEnabled={cloudEnabled}
            onSelect={onSelect}
            onShare={onShare}
            onPublish={onPublish}
            onDelete={onDelete}
          />
        ))}
      </div>
    </aside>
  );
});
