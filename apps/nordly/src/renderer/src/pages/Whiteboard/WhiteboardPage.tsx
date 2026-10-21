import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '@nordly-i18n';

import { isTauriRuntime } from '@platform/runtime';

import {
  listBoards,
  listBoardFolders,
  getBoard,
  createBoard,
  createBoardFolder,
  deleteBoard,
  deleteBoardFolder,
  moveBoardFolder,
  moveBoardToFolder,
  renameBoardFolder,
  updateBoardTitle,
  shareWhiteboard,
  publishWhiteboard,
  updateBoardScene,
  type Board,
  type BoardFolder,
} from '@features/whiteboard/api/whiteboardClient';
import { startLiveBoard, type LiveBoardStatus } from '@features/whiteboard/api/liveBoard';
import { requireCloudCta } from '@shared/api/cloudCta';
import { isCloudEnabled } from '@shared/model/features';
import type { EntityNavigationRequest } from '@shared/model/navigation';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { isEditableKeyboardTarget } from '@shared/lib/keyboardTarget';
import { NotesSidebarDivider, NotesSidebarEdge } from '@shared/ui/SidebarDivider';
import { VAULT_SIDEBAR_W } from '@shared/ui/vaultSidebar';

import { BoardCanvas, type BoardCanvasHandle } from './BoardCanvas';
import {
  BoardLoadStatus,
  INITIAL_BOARD_LOAD_STATE,
  boardLoadStateForSelection,
  failBoardLoad,
  finishBoardLoad,
  startBoardLoad,
} from './boardLoadState';
import { Sidebar } from './Sidebar';
import {
  BoardListStatus,
  INITIAL_LIST,
  SIDEBAR_COLLAPSED_KEY,
  errorMessage,
  sameBoardSummaries,
  type ListState,
} from './utils';

const SIDEBAR_W = VAULT_SIDEBAR_W;
const SIDEBAR_RESIZE_SETTLE_MS = 80;

async function copyLinkAndOpen(url: string): Promise<'copied' | 'opened'> {
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (err) {
    console.warn('[nordly:whiteboard] clipboard write failed', err);
  }
  const open = window.nordly?.shell?.openExternal;
  if (open) {
    await open(url);
    return 'opened';
  }
  if (isTauriRuntime()) throw new Error('external open is unavailable');
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) throw new Error('The browser blocked the whiteboard link');
  return 'opened';
}

interface WhiteboardPageProps {
  boardCanvas: BoardCanvasTheme;
  openRequest?: EntityNavigationRequest | null;
  onConsumeOpenRequest?: (requestKey: number) => void;
  onRegisterFlush: (flush: (() => Promise<boolean>) | null) => void;
}

export function WhiteboardPage({
  boardCanvas,
  openRequest = null,
  onConsumeOpenRequest,
  onRegisterFlush,
}: WhiteboardPageProps) {
  const t = useT();
  const [list, setList] = useState<ListState>(INITIAL_LIST);
  const listRef = useRef(list);
  listRef.current = list;
  const [folders, setFolders] = useState<BoardFolder[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const [boardLoad, setBoardLoad] = useState(INITIAL_BOARD_LOAD_STATE);
  const visibleBoardLoad = boardLoadStateForSelection(boardLoad, selectedId);
  const active =
    visibleBoardLoad.status === BoardLoadStatus.Ready
      ? visibleBoardLoad.board
      : null;
  const activeRef = useRef<Board | null>(null);
  activeRef.current = active;

  const [activeError, setActiveError] = useState<string | null>(null);
  const [activeLoadAttempt, setActiveLoadAttempt] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<LiveBoardStatus | null>(null);
  const liveRef = useRef<ReturnType<typeof startLiveBoard> | null>(null);
  const liveBoardIdRef = useRef<string | null>(null);

  const canvasRef = useRef<BoardCanvasHandle>(null);

  const flushPage = useCallback(async (): Promise<boolean> => {
    if (!canvasRef.current) return true;
    return canvasRef.current.flush();
  }, []);

  useEffect(() => {
    onRegisterFlush(flushPage);
    return () => onRegisterFlush(null);
  }, [flushPage, onRegisterFlush]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch (err) {
      console.warn('[nordly:whiteboard] sidebar collapse load failed', err);
      return false;
    }
  });
  const sidebarMountedRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
    } catch (err) {
      console.warn('[nordly:whiteboard] sidebar collapse persist failed', err);
    }
    if (!sidebarMountedRef.current) {
      sidebarMountedRef.current = true;
      return;
    }
    const t1 = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
    const t2 = window.setTimeout(
      () => window.dispatchEvent(new Event('resize')),
      SIDEBAR_RESIZE_SETTLE_MS,
    );
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onToggle = () => setSidebarCollapsed((c) => !c);
    window.addEventListener(NORDLY_EVENTS.toggleSidebar, onToggle as EventListener);
    return () => window.removeEventListener(NORDLY_EVENTS.toggleSidebar, onToggle as EventListener);
  }, []);

  const loadList = useCallback(() => {
    void Promise.all([listBoards(), listBoardFolders()])
      .then(([boards, nextFolders]) => {
        setFolders(nextFolders);
        setList((prev) =>
          prev.status === BoardListStatus.Ready &&
          sameBoardSummaries(prev.boards, boards)
            ? prev
            : { status: BoardListStatus.Ready, boards },
        );
        const firstId = boards[0]?.id ?? null;
        if (firstId) setSelectedId((cur) => cur ?? firstId);
      })
      .catch((err: unknown) => {
        setList((prev) => ({
          status: BoardListStatus.Failed,
          boards: prev.boards,
          error: errorMessage(err),
        }));
      });
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setBoardLoad(INITIAL_BOARD_LOAD_STATE);
      return;
    }
    if (activeRef.current?.id === selectedId) return;

    let cancelled = false;
    setActiveError(null);
    setBoardLoad(startBoardLoad(selectedId));

    void getBoard(selectedId)
      .then((b) => {
        if (cancelled) return;
        if (selectedIdRef.current !== selectedId) return;
        setBoardLoad(finishBoardLoad(b));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (selectedIdRef.current !== selectedId) return;
        setBoardLoad(failBoardLoad(selectedId, errorMessage(err)));
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, activeLoadAttempt]);

  const flushCanvas = useCallback(async (): Promise<boolean> => {
    return (await canvasRef.current?.flush()) ?? true;
  }, []);

  useEffect(() => {
    if (!openRequest) return;
    const request = openRequest;
    void (async () => {
      if (!(await flushCanvas())) return;
      onConsumeOpenRequest?.(request.requestKey);
      if (selectedIdRef.current === request.id && activeRef.current?.id === request.id) return;
      if (selectedIdRef.current === request.id) {
        setActiveLoadAttempt((attempt) => attempt + 1);
        return;
      }
      setBoardLoad(startBoardLoad(request.id));
      setSelectedId(request.id);
      setActiveError(null);
      setSaveError(null);
    })();
  }, [flushCanvas, onConsumeOpenRequest, openRequest]);

  const handleCreate = useCallback(async (folderId: string | null = null) => {
    if (!(await flushCanvas())) return;
    try {
      const b = await createBoard(t('nordly.whiteboard.untitled'), folderId);
      setList((prev) => ({
        status: BoardListStatus.Ready,
        boards: [
          { id: b.id, title: b.title, folderId: b.folderId, updatedAt: b.updatedAt },
          ...prev.boards,
        ],
      }));
      setSelectedId(b.id);
      setBoardLoad(finishBoardLoad(b));
      setActiveError(null);
      setSaveError(null);
    } catch (err: unknown) {
      setActiveError(errorMessage(err));
    }
  }, [flushCanvas, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        void handleCreate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleCreate]);

  const onSelectBoard = useCallback(
    (id: string) => {
      void (async () => {
        if (!(await flushCanvas())) return;
        setBoardLoad(startBoardLoad(id));
        setSelectedId(id);
        setActiveError(null);
        setSaveError(null);
      })();
    },
    [flushCanvas],
  );

  const handleRename = useCallback(async (id: string, title: string) => {
    try {
      const updated = await updateBoardTitle(id, title);
      setList((prev) => ({
        ...prev,
        boards: prev.boards.map((b) =>
          b.id === id
            ? { id: updated.id, title: updated.title, folderId: updated.folderId, updatedAt: updated.updatedAt }
            : b,
        ),
      }));
      setBoardLoad((current) =>
        current.status === BoardLoadStatus.Ready &&
        current.board.id === id
          ? finishBoardLoad({
              ...current.board,
              title: updated.title,
              updatedAt: updated.updatedAt,
            })
          : current,
      );
    } catch (err: unknown) {
      setActiveError(errorMessage(err));
      throw err;
    }
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      const deletingSelected = selectedIdRef.current === id;
      try {
        if (deletingSelected) {
          if (!(await flushCanvas())) return;
          canvasRef.current?.prepareDelete();
          setBoardLoad(INITIAL_BOARD_LOAD_STATE);
          setSaveError(null);
        }
        await deleteBoard(id);
        const nextId = deletingSelected
          ? (listRef.current.boards.find((board) => board.id !== id)?.id ?? null)
          : null;
        setList((prev) => {
          const boards = prev.boards.filter((b) => b.id !== id);
          return { status: BoardListStatus.Ready, boards };
        });
        if (deletingSelected) setSelectedId(nextId);
      } catch (err: unknown) {
        const message = errorMessage(err);
        setActiveError(message);
        if (deletingSelected) setBoardLoad(failBoardLoad(id, message));
        loadList();
      }
    },
    [flushCanvas, loadList],
  );

  const handleSaved = useCallback(() => {
    setSaveError(null);
    const id = selectedIdRef.current;
    if (!id) return;
    setList((prev) => ({
      ...prev,
      boards: prev.boards.map((row) =>
        row.id === id ? { ...row, updatedAt: new Date() } : row,
      ),
    }));
  }, []);

  const getScenePayload = useCallback(async (): Promise<string> => {
    if (!(await flushCanvas())) {
      throw new Error('Whiteboard could not be saved');
    }
    const sceneJson = canvasRef.current?.getSceneJson() ?? activeRef.current?.sceneJson;
    if (!sceneJson?.trim()) {
      throw new Error('Whiteboard scene is empty');
    }
    return sceneJson;
  }, [flushCanvas]);

  const handleShareLive = useCallback(async () => {
    const cta = await requireCloudCta();
    if (!cta.ok) {
      if (cta.reason !== 'cancelled') {
        setShareMsg(t('nordly.whiteboard.share_requires_cloud'));
      }
      return;
    }
    setShareMsg(null);
    try {
      const sceneJson = await getScenePayload();
      const title = activeRef.current?.title?.trim();
      if (!title) throw new Error('Board title is required');
      const res = await shareWhiteboard(sceneJson, title);
      liveRef.current?.stop();
      liveRef.current = startLiveBoard({
        roomId: res.roomId,
        accessToken: res.accessToken,
        expiresIn: res.expiresIn,
        initialSceneJson: sceneJson,
        onRemoteScene: (elements, files) => {
          canvasRef.current?.applyRemoteScene(elements, files);
        },
        onCollaborators: (peers) => {
          canvasRef.current?.applyCollaborators(peers);
        },
        onStatus: (status) => {
          setLiveStatus(status);
          if (status.kind !== 'ended') return;
          canvasRef.current?.applyCollaborators([]);
          if (status.reason === 'stopped') return;
          const session = liveRef.current;
          const boardId = liveBoardIdRef.current;
          if (session && boardId) {
            try {
              const sceneJson = session.readSceneJson();
              void updateBoardScene(boardId, sceneJson).catch((err: unknown) => {
                setShareMsg(err instanceof Error ? err.message : t('nordly.whiteboard.share_error'));
              });
            } catch (err: unknown) {
              setShareMsg(err instanceof Error ? err.message : t('nordly.whiteboard.share_error'));
            }
          }
          setShareMsg(status.message ?? t(`nordly.whiteboard.live.${status.reason}`));
        },
      });
      liveBoardIdRef.current = selectedIdRef.current;
      const url = res.inviteUrl;
      const outcome = await copyLinkAndOpen(url);
      if (outcome === 'copied') {
        const open = window.nordly?.shell.openExternal;
        if (open) void open(url);
      }
      setShareMsg(
        outcome === 'copied'
          ? t('nordly.whiteboard.share_copied')
          : t('nordly.whiteboard.share_opened'),
      );
    } catch (err: unknown) {
      setShareMsg(err instanceof Error ? err.message : t('nordly.whiteboard.share_error'));
    }
  }, [getScenePayload, t]);

  const handleStopLive = useCallback(async () => {
    const session = liveRef.current;
    liveRef.current = null;
    if (!session) return;
    const sceneJson = session.stop();
    const id = selectedIdRef.current;
    setLiveStatus(null);
    canvasRef.current?.applyCollaborators([]);
    if (!id) return;
    try {
      await updateBoardScene(id, sceneJson);
      setShareMsg(t('nordly.whiteboard.live.stopped'));
    } catch (err: unknown) {
      setShareMsg(err instanceof Error ? err.message : t('nordly.whiteboard.share_error'));
    }
  }, [t]);

  useEffect(() => {
    if (!liveRef.current || liveBoardIdRef.current === selectedId) return;
    const sceneJson = liveRef.current.stop();
    const boardId = liveBoardIdRef.current;
    liveRef.current = null;
    liveBoardIdRef.current = null;
    setLiveStatus(null);
    canvasRef.current?.applyCollaborators([]);
    if (boardId) {
      void updateBoardScene(boardId, sceneJson).catch((err: unknown) => {
        setShareMsg(err instanceof Error ? err.message : t('nordly.whiteboard.share_error'));
      });
    }
  }, [selectedId]);

  const handlePublish = useCallback(async () => {
    const cta = await requireCloudCta();
    if (!cta.ok) {
      if (cta.reason !== 'cancelled') {
        setShareMsg(t('nordly.whiteboard.share_requires_cloud'));
      }
      return;
    }
    setShareMsg(null);
    try {
      const sceneJson = await getScenePayload();
      const title = activeRef.current?.title?.trim();
      if (!title) throw new Error('Board title is required');
      const res = await publishWhiteboard(sceneJson, title);
      const outcome = await copyLinkAndOpen(res.url);
      if (outcome === 'copied') {
        const open = window.nordly?.shell.openExternal;
        if (open) void open(res.url);
      }
      setShareMsg(
        outcome === 'copied'
          ? t('nordly.whiteboard.publish_copied')
          : t('nordly.whiteboard.publish_opened'),
      );
    } catch (err: unknown) {
      setShareMsg(err instanceof Error ? err.message : t('nordly.whiteboard.share_error'));
    }
  }, [getScenePayload, t]);

  const retryActive = useCallback(() => {
    const id = selectedIdRef.current;
    setActiveError(null);
    if (!id) {
      loadList();
      return;
    }
    setBoardLoad(startBoardLoad(id));
    setActiveLoadAttempt((attempt) => attempt + 1);
  }, [loadList]);

  return (
    <div className="nordly-vault nordly-whiteboard">
      <aside
        className="nordly-vault-sidebar-wrap"
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        style={{ width: sidebarCollapsed ? 0 : SIDEBAR_W }}
      >
        <div className="nordly-vault-sidebar-wrap__inner" style={{ width: SIDEBAR_W }}>
          <Sidebar
            list={list}
            folders={folders}
            selectedId={selectedId}
            cloudEnabled={isCloudEnabled()}
            onSelect={onSelectBoard}
            onCreate={(folderId) => void handleCreate(folderId)}
            onCreateFolder={async (parentId) => {
              try {
                const folder = await createBoardFolder(
                  t('nordly.whiteboard.folder.default_name'),
                  parentId,
                );
                setFolders((prev) => [...prev, folder]);
                return folder;
              } catch (err: unknown) {
                setActiveError(errorMessage(err));
                throw err;
              }
            }}
            onRenameFolder={async (id, name) => {
              try {
                const folder = await renameBoardFolder(id, name);
                setFolders((prev) => prev.map((item) => (item.id === id ? folder : item)));
              } catch (err: unknown) {
                setActiveError(errorMessage(err));
              }
            }}
            onDeleteFolder={async (id) => {
              try {
                await deleteBoardFolder(id);
                loadList();
              } catch (err: unknown) {
                setActiveError(errorMessage(err));
              }
            }}
            onRename={handleRename}
            onMove={async (id, folderId) => {
              try {
                const updated = await moveBoardToFolder(id, folderId);
                setList((prev) => ({
                  ...prev,
                  boards: prev.boards.map((board) =>
                    board.id === id
                      ? { ...board, folderId: updated.folderId, updatedAt: updated.updatedAt }
                      : board,
                  ),
                }));
              } catch (err: unknown) {
                setActiveError(errorMessage(err));
              }
            }}
            onMoveFolder={async (id, parentId) => {
              try {
                const folder = await moveBoardFolder(id, parentId);
                setFolders((prev) => prev.map((item) => (item.id === id ? folder : item)));
              } catch (err: unknown) {
                setActiveError(errorMessage(err));
              }
            }}
            onShare={() => void handleShareLive()}
            onPublish={() => void handlePublish()}
            onDelete={handleDelete}
          />
        </div>
      </aside>

      <NotesSidebarDivider
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(true)}
      />

      <div className="nordly-vault-main nordly-whiteboard-main">
        {sidebarCollapsed && <NotesSidebarEdge onExpand={() => setSidebarCollapsed(false)} />}

        {list.status === BoardListStatus.Failed ? (
          <EmptyPane message={list.error} onRetry={loadList} />
        ) : activeError ? (
          <EmptyPane message={activeError} onRetry={retryActive} />
        ) : list.status === BoardListStatus.Ready &&
          list.boards.length === 0 ? (
          <EmptyPane message={t('nordly.whiteboard.empty_dim')} onCreate={() => void handleCreate()} />
        ) : visibleBoardLoad.status === BoardLoadStatus.Failed ? (
          <EmptyPane message={visibleBoardLoad.error} onRetry={retryActive} />
        ) : visibleBoardLoad.status === BoardLoadStatus.Loading ? (
          <EmptyPane message={t('nordly.app.loading')} dim />
        ) : active ? (
          <BoardCanvas
            ref={canvasRef}
            boardId={active.id}
            sceneJson={active.sceneJson}
            boardTheme={boardCanvas}
            onSaved={handleSaved}
            onSaveError={setSaveError}
            onLiveChange={(elements, files) => liveRef.current?.writeLocal(elements, files)}
            collaborating={liveStatus?.kind === 'live' || liveStatus?.kind === 'connecting'}
            onPointerUpdate={(pointer) => liveRef.current?.reportPointer(pointer)}
          />
        ) : (
          <EmptyPane message={t('nordly.whiteboard.empty_dim')} onCreate={() => void handleCreate()} dim />
        )}

        {liveStatus && liveStatus.kind !== 'ended' && (
          <div className="mono nordly-whiteboard-live">
            <span>
              {liveStatus.kind === 'live'
                ? t('nordly.whiteboard.live.badge', { count: String(liveStatus.participants) })
                : t('nordly.whiteboard.live.connecting')}
            </span>
            <button type="button" className="nordly-whiteboard-live__stop focus-ring" onClick={() => void handleStopLive()}>
              {t('nordly.whiteboard.live.stop')}
            </button>
          </div>
        )}

        {shareMsg && (
          <div className={`mono nordly-whiteboard-toast${saveError ? ' nordly-whiteboard-toast--raised' : ''}`}>
            {shareMsg}
          </div>
        )}

        {saveError && (
          <div className="mono nordly-whiteboard-toast">
            {t('nordly.whiteboard.save_failed', { msg: saveError })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyPane({
  message,
  onRetry,
  onCreate,
  dim,
}: {
  message: string;
  onRetry?: () => void;
  onCreate?: () => void;
  dim?: boolean;
}) {
  const t = useT();
  return (
    <div className="nordly-vault-empty" data-dim={dim ? 'true' : 'false'}>
      <p className="mono" style={{ fontSize: 11, letterSpacing: '.12em', color: 'var(--ink-40)' }}>
        {message}
      </p>
      {onCreate && (
        <button type="button" className="nordly-vault-empty__cta focus-ring" onClick={onCreate}>
          {t('nordly.whiteboard.empty_cta')}
        </button>
      )}
      {onRetry && (
        <button type="button" className="nordly-vault-empty__cta focus-ring" onClick={onRetry}>
          {t('nordly.error.retry')}
        </button>
      )}
    </div>
  );
}
