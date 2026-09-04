import { useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';

import type {
  NoteFolder,
  NoteSummary,
  PublishStatus,
  PublishToWebOptions,
} from '@features/notes/api/notesClient';
import { DraggableFolderRow } from './DraggableFolderRow';
import { DraggableNoteRow } from './DraggableNoteRow';
import { FolderInsertPreview } from './FolderInsertPreview';
import { NoteInsertPreview } from './NoteInsertPreview';
import {
  UNFILED_DROPPABLE_ID,
  folderDroppableId,
  type NoteDropData,
} from './noteDnd';
import { folderSelKey, noteSelKey, type SelectMods } from './selectionKeys';

function RootDropZone({
  children,
  enabled,
  dropActive,
}: {
  children: React.ReactNode;
  enabled: boolean;
  dropActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: UNFILED_DROPPABLE_ID,
    disabled: !enabled,
    data: { type: 'unfiled' } satisfies NoteDropData,
  });

  if (!enabled) return <>{children}</>;

  return (
    <div
      ref={setNodeRef}
      className="nordly-notes-root-drop"
      data-drop-active={isOver || dropActive ? 'true' : 'false'}
    >
      {children}
    </div>
  );
}

function FolderDropZone({
  folderId,
  disabled,
  previewChildren,
  previewActive,
  open,
  onHoverOpen,
  header,
  children,
  dragging = false,
  previewing = false,
}: {
  folderId: string;
  disabled: boolean;
  previewChildren: React.ReactNode;
  previewActive: boolean;
  open: boolean;
  onHoverOpen: (folderId: string) => void;
  header: React.ReactNode;
  children: React.ReactNode;
  dragging?: boolean;
  previewing?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: folderDroppableId(folderId),
    disabled,
    data: { type: 'folder', folderId } satisfies NoteDropData,
  });

  useEffect(() => {
    if (previewActive) onHoverOpen(folderId);
  }, [previewActive, folderId, onHoverOpen]);

  return (
    <div
      ref={setNodeRef}
      className={`nordly-folder-group nordly-folder-drop${dragging ? ' nordly-folder-group--dragging' : ''}${previewing ? ' nordly-folder-group--previewing' : ''}`}
      data-drop-active={isOver || previewActive ? 'true' : 'false'}
    >
      {header}
      {open ? (previewActive ? previewChildren : children) : null}
    </div>
  );
}

export interface NotesFolderTreeProps {
  rootFolders: NoteFolder[];
  unfiledNotes: NoteSummary[];
  notesByFolder: Map<string, NoteSummary[]>;
  childrenByParent: Map<string | null, NoteFolder[]>;
  folderIds: Set<string>;
  hasFolders: boolean;
  openFolderIds: Set<string>;
  renamingFolderId: string | null;
  selectionIds: Set<string>;
  selectedId: string | null;
  createTargetFolderId: string | null;
  openMenuId: string | null;
  activeNote: NoteSummary | null;
  activeFolder: NoteFolder | null;
  previewFolderId: string | null | undefined;
  folderDropBlockedIds: Set<string> | null;
  onHoverOpen: (folderId: string) => void;
  onToggleFolder: (id: string) => void;
  onNoteSelect: (id: string, mods: SelectMods) => void;
  onFolderSelect: (id: string, mods: SelectMods) => void;
  onStartRename: (id: string) => void;
  onCommitRename: (id: string, name: string) => void;
  onCancelRename: () => void;
  onCreateNote: (folderId: string) => void;
  onCreateFolder: (parentId: string) => Promise<NoteFolder>;
  onDeleteFolder: (id: string) => Promise<void>;
  onPublish: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUpdatePublishOptions: (id: string, options: PublishToWebOptions) => Promise<PublishStatus | void>;
  onUnpublish: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onError?: (message: string) => void;
  setOpenMenuId: (id: string | null) => void;
}

export function NotesFolderTree({
  rootFolders,
  unfiledNotes,
  notesByFolder,
  childrenByParent,
  folderIds,
  hasFolders,
  openFolderIds,
  renamingFolderId,
  selectionIds,
  selectedId,
  createTargetFolderId,
  openMenuId,
  activeNote,
  activeFolder,
  previewFolderId,
  folderDropBlockedIds,
  onHoverOpen,
  onToggleFolder,
  onNoteSelect,
  onFolderSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onCreateNote,
  onCreateFolder,
  onDeleteFolder,
  onPublish,
  onUpdatePublishOptions,
  onUnpublish,
  onDelete,
  onError,
  setOpenMenuId,
}: NotesFolderTreeProps) {
  const activeNoteFolderId =
    activeNote?.folderId && folderIds.has(activeNote.folderId) ? activeNote.folderId : null;
  const activeFolderParentId = activeFolder
    ? activeFolder.parentId && folderIds.has(activeFolder.parentId)
      ? activeFolder.parentId
      : null
    : undefined;

  const renderNote = (n: NoteSummary, nested: boolean, depth: number) => (
    <DraggableNoteRow
      key={n.id}
      note={n}
      nested={nested}
      depth={depth}
      active={selectedId === n.id}
      selected={selectionIds.has(noteSelKey(n.id))}
      menuOpen={openMenuId === n.id}
      dragDisabled={!hasFolders}
      forceDragging={activeNote?.id === n.id}
      onMenuOpenChange={(open) => setOpenMenuId(open ? n.id : null)}
      onSelect={onNoteSelect}
      onPublish={onPublish}
      onUpdatePublishOptions={onUpdatePublishOptions}
      onUnpublish={onUnpublish}
      onDelete={onDelete}
      onError={onError}
    />
  );

  const renderFolderInsertPreview = (folder: NoteFolder, depth: number): React.ReactNode => {
    const open = openFolderIds.has(folder.id);
    const childNotes = notesByFolder.get(folder.id) ?? [];
    const childFolders = childrenByParent.get(folder.id) ?? [];

    return (
      <FolderInsertPreview
        key={`preview:folder:${folder.id}`}
        folder={folder}
        depth={depth}
        open={open}
      >
        {childNotes.map((note) => (
          <NoteInsertPreview
            key={`preview:note:${note.id}`}
            note={note}
            nested
            depth={depth}
          />
        ))}
        {childFolders.map((child) => renderFolderInsertPreview(child, depth + 1))}
      </FolderInsertPreview>
    );
  };

  const renderDropPreview = (
    notes: NoteSummary[],
    nested: boolean,
    targetFolderId: string | null,
    depth: number,
  ): React.ReactNode => {
    const rows = notes.map((note) => renderNote(note, nested, depth));

    if (activeNote) {
      if (activeNoteFolderId !== targetFolderId) {
        return [
          <NoteInsertPreview
            key={`preview:${targetFolderId ?? 'unfiled'}`}
            note={activeNote}
            nested={nested}
            depth={depth}
          />,
          ...rows,
        ];
      }
      return notes.map((note) =>
        note.id === activeNote.id ? (
          <div className="nordly-note-drag-origin" key={`preview:${note.id}`}>
            {renderNote(note, nested, depth)}
            <NoteInsertPreview note={activeNote} nested={nested} depth={depth} />
          </div>
        ) : (
          renderNote(note, nested, depth)
        ),
      );
    }

    if (activeFolder && activeFolderParentId !== targetFolderId) {
      return [renderFolderInsertPreview(activeFolder, nested ? depth + 1 : 0), ...rows];
    }

    return rows;
  };

  const renderIdleRows = (
    notes: NoteSummary[],
    nested: boolean,
    containerFolderId: string | null,
    depth: number,
  ): React.ReactNode =>
    notes
      .filter(
        (note) =>
          !activeNote ||
          note.id !== activeNote.id ||
          activeNoteFolderId !== containerFolderId ||
          previewFolderId === containerFolderId,
      )
      .map((note) => renderNote(note, nested, depth));

  const renderFolderTree = (folderList: NoteFolder[], depth: number): React.ReactNode =>
    folderList.map((folder) => {
      const open = openFolderIds.has(folder.id) || renamingFolderId === folder.id;
      const childNotes = notesByFolder.get(folder.id) ?? [];
      const childFolders = childrenByParent.get(folder.id) ?? [];
      const folderDragging = activeFolder?.id === folder.id;
      const dropDisabled =
        renamingFolderId === folder.id || Boolean(folderDropBlockedIds?.has(folder.id));
      const parentId =
        folder.parentId && folderIds.has(folder.parentId) ? folder.parentId : null;
      const sameParentOrigin =
        folderDragging && activeFolder != null && previewFolderId === parentId;

      return (
        <FolderDropZone
          key={folder.id}
          folderId={folder.id}
          disabled={dropDisabled}
          dragging={folderDragging}
          previewing={sameParentOrigin}
          previewChildren={
            <>
              {renderDropPreview(childNotes, true, folder.id, depth)}
              {renderFolderTree(childFolders, depth + 1)}
            </>
          }
          previewActive={
            (activeNote != null || activeFolder != null) && previewFolderId === folder.id
          }
          open={open}
          onHoverOpen={onHoverOpen}
          header={
            <DraggableFolderRow
              folder={folder}
              open={open}
              selected={
                selectionIds.has(folderSelKey(folder.id)) ||
                createTargetFolderId === folder.id
              }
              depth={depth}
              menuOpen={openMenuId === `folder:${folder.id}`}
              renaming={renamingFolderId === folder.id}
              forceDragging={folderDragging}
              onMenuOpenChange={(menuOpen) =>
                setOpenMenuId(menuOpen ? `folder:${folder.id}` : null)
              }
              onToggle={onToggleFolder}
              onSelect={onFolderSelect}
              onStartRename={onStartRename}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onCreateNote={onCreateNote}
              onCreateFolder={onCreateFolder}
              onDelete={onDeleteFolder}
            />
          }
        >
          {open ? (
            <>
              {renderIdleRows(childNotes, true, folder.id, depth)}
              {renderFolderTree(childFolders, depth + 1)}
            </>
          ) : null}
        </FolderDropZone>
      );
    });

  return (
    <RootDropZone
      enabled={hasFolders}
      dropActive={(activeNote != null || activeFolder != null) && previewFolderId === null}
    >
      {previewFolderId === null && (activeNote != null || activeFolder != null)
        ? renderDropPreview(unfiledNotes, false, null, 0)
        : renderIdleRows(unfiledNotes, false, null, 0)}
      {renderFolderTree(rootFolders, 0)}
    </RootDropZone>
  );
}
