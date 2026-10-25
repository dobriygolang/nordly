import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STORAGE_KEYS } from '@shared/lib/storage-keys';
import { useNotesSidebarSelection } from '../useNotesSidebarSelection';
import { NoteListStatus } from '../utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Props = Parameters<typeof useNotesSidebarSelection>[0];
let root: Root;
let container: HTMLDivElement;
let latest: ReturnType<typeof useNotesSidebarSelection>;
let props: Props;

function Harness() {
  latest = useNotesSidebarSelection(props);
  return null;
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  props = {
    list: { status: NoteListStatus.Loading, notes: [] }, folders: [], selectedId: null,
    onSelect: vi.fn(), onFocusFolder: vi.fn(), onDeleteFolder: vi.fn(), onDeleteMany: vi.fn(),
    listFocusRef: { current: null }, rootRef: { current: null }, renamingFolderId: null,
    createMenuOpen: false, openMenuId: null, activeNote: null, activeFolder: null,
    deleteConfirm: null, deleteBusy: false, setDeleteConfirm: vi.fn(),
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('notes sidebar restore', () => {
  it('keeps saved open folders until the initial folder list arrives', async () => {
    localStorage.setItem(STORAGE_KEYS.notesFoldersOpen, JSON.stringify(['parent', 'child']));
    await act(async () => root.render(createElement(Harness)));
    expect([...latest.openFolderIds]).toEqual(['parent', 'child']);
    props = {
      ...props,
      list: { status: NoteListStatus.Ready, notes: [] },
      folders: [{ id: 'parent', name: 'Parent', parentId: null, createdAt: '', updatedAt: '' }],
    };
    await act(async () => root.render(createElement(Harness)));
    expect([...latest.openFolderIds]).toEqual(['parent']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.notesFoldersOpen)!)).toEqual(['parent']);
  });

  it('reveals all parent folders of the restored note', async () => {
    props = {
      ...props, selectedId: 'note',
      list: { status: NoteListStatus.Ready, notes: [
        { id: 'note', title: 'Note', folderId: 'child', updatedAt: null, sizeBytes: 0 },
      ] },
      folders: [
        { id: 'parent', name: 'Parent', parentId: null, createdAt: '', updatedAt: '' },
        { id: 'child', name: 'Child', parentId: 'parent', createdAt: '', updatedAt: '' },
      ],
    };
    await act(async () => root.render(createElement(Harness)));
    expect(latest.openFolderIds.has('parent')).toBe(true);
    expect(latest.openFolderIds.has('child')).toBe(true);
    await act(async () => latest.toggleFolder('parent'));
    props = { ...props, list: { ...props.list, notes: [...props.list.notes] } };
    await act(async () => root.render(createElement(Harness)));
    expect(latest.openFolderIds.has('parent')).toBe(false);
  });
});
