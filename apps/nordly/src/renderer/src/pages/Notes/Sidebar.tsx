import { memo, useState } from 'react';

import { useT } from '@nordly-i18n';

import { Icon } from '@shared/ui/primitives/Icon';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import type { PublishStatus, PublishToWebOptions } from '@features/notes/api/notesClient';
import { NoteRow } from './NoteRow';
import { type ListState } from './utils';

export interface SidebarProps {
  list: ListState;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onPublish: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUpdatePublishOptions: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUnpublish: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const Sidebar = memo(function Sidebar({
  list,
  selectedId,
  onSelect,
  onCreate,
  onPublish,
  onUpdatePublishOptions,
  onUnpublish,
  onDelete,
}: SidebarProps) {
  const t = useT();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
        <span className="nordly-vault-sidebar__label">{t('nordly.notes.sidebar_title')}</span>
        <button
          type="button"
          className="nordly-vault-sidebar__btn nordly-icon-btn"
          title={t('nordly.notes.new')}
          onClick={onCreate}
        >
          <Icon name="plus" size={16} strokeWidth={1.8} />
        </button>
      </div>

      <div className="nordly-vault-sidebar__list">
        {list.notes.map((n) => (
          <NoteRow
            key={n.id}
            note={n}
            active={selectedId === n.id}
            menuOpen={openMenuId === n.id}
            onMenuOpenChange={(open) => setOpenMenuId(open ? n.id : null)}
            onSelect={onSelect}
            onPublish={onPublish}
            onUpdatePublishOptions={onUpdatePublishOptions}
            onUnpublish={onUnpublish}
            onDelete={onDelete}
          />
        ))}
      </div>
    </aside>
  );
});
