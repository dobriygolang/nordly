import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '@nordly-i18n';

import type { Note } from '@features/notes/api/notesClient';
import { NotesSidebarDivider, NotesSidebarEdge } from '@shared/ui/SidebarDivider';
import { VAULT_SIDEBAR_W } from '@shared/ui/vaultSidebar';
import type { EntityNavigationRequest } from '@shared/model/navigation';
import { Sidebar } from './Sidebar';
import { Editor } from './Editor';
import { FileDropOverlay } from './FileDropOverlay';
import { VaultOnboarding } from './VaultOnboarding';
import { useNotesAutosave } from './useNotesAutosave';
import { useNotesFileDrop } from './useNotesFileDrop';
import { useNotesList } from './useNotesList';
import { useNotesPageActions } from './useNotesPageActions';
import { useNotesSidebarChrome } from './useNotesSidebarChrome';
import { useNotesVaultWatch } from './useNotesVaultWatch';

export interface NotesPageProps {
  openRequest?: EntityNavigationRequest | null;
  onConsumeOpenRequest?: (requestKey: number) => void;
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
}

export function NotesPage({
  openRequest,
  onConsumeOpenRequest,
  onRegisterFlush,
}: NotesPageProps) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(openRequest?.id ?? null);
  const selectedIdRef = useRef<string | null>(selectedId);
  selectedIdRef.current = selectedId;
  const [active, setActive] = useState<Note | null>(null);
  const activeRef = useRef<Note | null>(null);
  activeRef.current = active;
  const [activeError, setActiveError] = useState<string | null>(null);
  const [createTargetFolderId, setCreateTargetFolderId] = useState<string | null>(null);
  const focusFolderIdRef = useRef<string | null>(null);
  focusFolderIdRef.current = createTargetFolderId;
  const [editorSessionKey, setEditorSessionKey] = useState(0);
  const bumpEditorSession = useCallback(() => {
    setEditorSessionKey((k) => k + 1);
  }, []);

  const listApi = useNotesList({ t, setSelectedId });
  const loadList = listApi.loadList;
  const scheduleLoadList = listApi.scheduleLoadList;
  const autosave = useNotesAutosave({
    t,
    selectedId,
    selectedIdRef,
    active,
    activeRef,
    setSelectedId,
    setList: listApi.setList,
    setActive,
    setActiveError,
    onRegisterFlush,
  });
  const flushNow = autosave.flushNow;
  const { vaultReady, setVaultReady } = useNotesVaultWatch({
    t,
    loadList: scheduleLoadList,
    selectedId,
    selectedIdRef,
    setSelectedId,
    setActive,
    acceptLoadedNote: autosave.acceptLoadedNote,
    setActiveError,
    draftRef: autosave.draftRef,
    lastSavedRef: autosave.lastSavedRef,
  });

  useEffect(() => {
    if (vaultReady !== true) return;
    loadList();
  }, [loadList, vaultReady]);

  const fileDrop = useNotesFileDrop({
    t,
    flushNow: autosave.flushNow,
    focusFolderIdRef,
    selectedIdRef,
    draftRef: autosave.draftRef,
    lastSavedRef: autosave.lastSavedRef,
    setList: listApi.setList,
    setFolders: listApi.setFolders,
    setSelectedId,
    setActive,
    setDraftTitle: autosave.setDraftTitle,
    setDraftBody: autosave.setDraftBody,
    setActiveError,
    bumpEditorSession,
  });
  const chrome = useNotesSidebarChrome();
  const actions = useNotesPageActions({
    t,
    folders: listApi.folders,
    list: listApi.list,
    createTargetFolderId,
    focusFolderIdRef,
    selectedIdRef,
    draftRef: autosave.draftRef,
    lastSavedRef: autosave.lastSavedRef,
    saveTimer: autosave.saveTimer,
    loadList: listApi.loadList,
    flushNow: autosave.flushNow,
    setFolders: listApi.setFolders,
    setList: listApi.setList,
    setSelectedId,
    setActive,
    setDraftTitle: autosave.setDraftTitle,
    setDraftBody: autosave.setDraftBody,
    setActiveError,
    setCreateTargetFolderId,
    bumpEditorSession,
  });
  const handleCreate = actions.handleCreate;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 'n') return;
      e.preventDefault();
      void handleCreate();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleCreate]);

  useEffect(() => {
    if (!openRequest) return;
    let cancelled = false;
    void (async () => {
      if (!(await flushNow()) || cancelled) return;
      if (selectedIdRef.current !== openRequest.id) {
        bumpEditorSession();
        setActive(null);
      }
      selectedIdRef.current = openRequest.id;
      setSelectedId(openRequest.id);
      onConsumeOpenRequest?.(openRequest.requestKey);
    })();
    return () => {
      cancelled = true;
    };
  }, [openRequest, flushNow, onConsumeOpenRequest, bumpEditorSession]);

  const onSelectNote = useCallback(
    (id: string) => {
      void (async () => {
        if (!(await flushNow())) return;
        if (selectedIdRef.current !== id) {
          bumpEditorSession();
          setActive(null);
        }
        selectedIdRef.current = id;
        setSelectedId(id);
      })();
    },
    [flushNow, bumpEditorSession],
  );

  const noteTitles = useMemo(
    () => listApi.list.notes.map((n) => n.title).filter((title) => title.trim().length > 0),
    [listApi.list.notes],
  );

  if (vaultReady === null) {
    return <div className="nordly-vault" />;
  }

  if (vaultReady === false) {
    return (
      <div className="nordly-vault">
        <div className="nordly-vault-main">
          <VaultOnboarding
            onBound={(result) => {
              setVaultReady(true);
              if (result?.skippedLocked) {
                setActiveError(
                  t('nordly.notes.vault_onboarding.skipped_locked').replace(
                    '{{count}}',
                    String(result.skippedLocked),
                  ),
                );
              }
              listApi.loadList();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="nordly-vault"
      onDragEnter={fileDrop.onFileDragEnter}
      onDragOver={fileDrop.onFileDragOver}
      onDragLeave={fileDrop.onFileDragLeave}
      onDrop={(e) => void fileDrop.handleFileDrop(e)}
    >
      <aside
        className="nordly-vault-sidebar-wrap"
        data-collapsed={chrome.sidebarCollapsed ? 'true' : 'false'}
        style={{ width: chrome.sidebarCollapsed ? 0 : VAULT_SIDEBAR_W }}
      >
        <div className="nordly-vault-sidebar-wrap__inner" style={{ width: VAULT_SIDEBAR_W }}>
          <Sidebar
            list={listApi.list}
            folders={listApi.folders}
            selectedId={selectedId}
            createTargetFolderId={createTargetFolderId}
            onSelect={onSelectNote}
            onCreateNote={actions.handleCreate}
            onCreateFolder={actions.handleCreateFolder}
            onRenameFolder={actions.handleRenameFolder}
            onDeleteFolder={actions.handleDeleteFolder}
            onMoveNote={actions.handleMoveNote}
            onMoveFolder={actions.handleMoveFolder}
            onFocusFolder={actions.handleFocusFolder}
            onPublish={actions.handlePublish}
            onUpdatePublishOptions={actions.handleUpdatePublishOptions}
            onUnpublish={actions.handleUnpublish}
            onDelete={actions.handleDeleteNote}
            onDeleteMany={actions.handleDeleteNotes}
            onError={setActiveError}
          />
        </div>
      </aside>

      <NotesSidebarDivider
        collapsed={chrome.sidebarCollapsed}
        onToggle={() => chrome.setSidebarCollapsed(true)}
      />

      <div className="nordly-vault-main">
        {chrome.sidebarCollapsed && (
          <NotesSidebarEdge onExpand={() => chrome.setSidebarCollapsed(false)} />
        )}
        <Editor
          list={listApi.list}
          active={active}
          editorSessionKey={editorSessionKey}
          activeError={activeError}
          draftTitle={autosave.draftTitle}
          draftBody={autosave.draftBody}
          saveStatus={autosave.saveStatus}
          noteTitles={noteTitles}
          editorZoom={chrome.editorZoom}
          onTitleChange={autosave.setDraftTitle}
          onBodyChange={autosave.setDraftBody}
          onWikiLinkClick={(linkText) => void actions.handleWikiLinkClick(linkText)}
          onCreate={actions.handleCreate}
          onRetryList={listApi.loadList}
          onError={setActiveError}
        />
      </div>

      <FileDropOverlay active={fileDrop.fileDropActive} />
    </div>
  );
}
