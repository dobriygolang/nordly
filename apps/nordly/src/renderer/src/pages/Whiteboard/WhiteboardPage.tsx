import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '@nordly-i18n';

import {
  listBoards,
  getBoard,
  createBoard,
  deleteBoard,
  type Board,
} from '@features/whiteboard/api/whiteboardClient';
import {
  remotePublishWhiteboard,
  remoteShareWhiteboard,
} from '@features/whiteboard/api/whiteboardRemote';
import { isCloudEnabled } from '@shared/model/features';
import type { BoardCanvasTheme } from '@shared/lib/excalidraw/nordlyTheme';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';
import { NotesSidebarDivider, NotesSidebarEdge } from '@shared/ui/SidebarDivider';

import { BoardCanvas, type BoardCanvasHandle } from './BoardCanvas';
import { Sidebar } from './Sidebar';
import {
  INITIAL_LIST,
  SIDEBAR_COLLAPSED_KEY,
  errorMessage,
  type ListState,
} from './utils';

const SIDEBAR_W = 252;
const SIDEBAR_RESIZE_SETTLE_MS = 80;

async function copyLinkAndOpen(url: string): Promise<'copied' | 'opened'> {
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    /* clipboard denied or unavailable */
  }
  const open = window.nordly?.shell.openExternal;
  if (open) {
    await open(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return 'opened';
}

interface WhiteboardPageProps {
  boardCanvas: BoardCanvasTheme;
}

export function WhiteboardPage({ boardCanvas }: WhiteboardPageProps) {
  const t = useT();
  const [list, setList] = useState<ListState>(INITIAL_LIST);
  const listRef = useRef(list);
  listRef.current = list;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const [active, setActive] = useState<Board | null>(null);
  const activeRef = useRef<Board | null>(null);
  activeRef.current = active;

  const [activeError, setActiveError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const canvasRef = useRef<BoardCanvasHandle>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });
  const sidebarMountedRef = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
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
    void listBoards()
      .then((boards) => {
        setList({ status: 'ok', boards, error: null });
        const firstId = boards[0]?.id ?? null;
        if (firstId) setSelectedId((cur) => cur ?? firstId);
      })
      .catch((err: unknown) => {
        setList((prev) => {
          if (prev.status === 'ok' && prev.boards.length > 0) return prev;
          return { status: 'error', boards: [], error: errorMessage(err) };
        });
      });
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setActive(null);
      return;
    }
    if (activeRef.current?.id === selectedId) return;

    let cancelled = false;
    setActiveError(null);

    void getBoard(selectedId)
      .then((b) => {
        if (cancelled) return;
        if (selectedIdRef.current !== selectedId) return;
        setActive(b);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (!activeRef.current) {
          setActiveError(errorMessage(err));
          setActive(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const flushCanvas = useCallback(async () => {
    await canvasRef.current?.flush();
  }, []);

  const handleCreate = useCallback(async () => {
    await flushCanvas();
    try {
      const b = await createBoard(t('nordly.whiteboard.untitled'));
      setList((prev) => ({
        ...prev,
        status: 'ok',
        boards: [{ id: b.id, title: b.title, updatedAt: b.updatedAt }, ...prev.boards],
      }));
      setSelectedId(b.id);
      setActive(b);
      setActiveError(null);
      setSaveError(null);
    } catch (err: unknown) {
      setActiveError(errorMessage(err));
    }
  }, [flushCanvas, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
        await flushCanvas();
        setSelectedId(id);
        setSaveError(null);
      })();
    },
    [flushCanvas],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const deletingSelected = selectedIdRef.current === id;
      try {
        if (deletingSelected) {
          canvasRef.current?.prepareDelete();
          setActive(null);
          setSaveError(null);
        }
        await deleteBoard(id);
        let nextId: string | null = null;
        setList((prev) => {
          const boards = prev.boards.filter((b) => b.id !== id);
          if (deletingSelected) nextId = boards[0]?.id ?? null;
          return { ...prev, status: 'ok', boards };
        });
        if (deletingSelected) setSelectedId(nextId);
      } catch (err: unknown) {
        setActiveError(errorMessage(err));
        loadList();
      }
    },
    [loadList],
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
    await flushCanvas();
    return canvasRef.current?.getSceneJson() ?? activeRef.current?.sceneJson ?? '';
  }, [flushCanvas]);

  const handleShareLive = useCallback(async () => {
    if (!isCloudEnabled()) return;
    setShareMsg(null);
    try {
      const sceneJson = await getScenePayload();
      const title = activeRef.current?.title;
      const res = await remoteShareWhiteboard(sceneJson, title);
      const url = `${import.meta.env.VITE_NORDLY_WEB_BASE ?? 'https://trynordly.app'}/live/${res.roomId}`;
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

  const handlePublish = useCallback(async () => {
    if (!isCloudEnabled()) return;
    setShareMsg(null);
    try {
      const sceneJson = await getScenePayload();
      const title = activeRef.current?.title;
      const res = await remotePublishWhiteboard(sceneJson, title);
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

  return (
    <div className="nordly-vault">
      <aside
        className="nordly-vault-sidebar-wrap"
        data-collapsed={sidebarCollapsed ? 'true' : 'false'}
        style={{ width: sidebarCollapsed ? 0 : SIDEBAR_W }}
      >
        <div className="nordly-vault-sidebar-wrap__inner" style={{ width: SIDEBAR_W }}>
          <Sidebar
            list={list}
            selectedId={selectedId}
            cloudEnabled={isCloudEnabled()}
            onSelect={onSelectBoard}
            onCreate={() => void handleCreate()}
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

        {list.status === 'error' ? (
          <EmptyPane message={list.error ?? ''} onRetry={loadList} />
        ) : !active && list.status === 'ok' && list.boards.length === 0 ? (
          <EmptyPane message={t('nordly.whiteboard.empty_dim')} onCreate={() => void handleCreate()} />
        ) : !active ? (
          <EmptyPane message={t('nordly.whiteboard.empty_dim')} onCreate={() => void handleCreate()} dim />
        ) : activeError ? (
          <EmptyPane message={activeError} onRetry={loadList} />
        ) : (
          <BoardCanvas
            ref={canvasRef}
            boardId={active.id}
            sceneJson={active.sceneJson}
            boardTheme={boardCanvas}
            onSaved={handleSaved}
            onSaveError={setSaveError}
          />
        )}

        {shareMsg && (
          <div
            className="mono"
            style={{
              position: 'absolute',
              bottom: saveError ? 48 : 24,
              left: 24,
              fontSize: 10,
              color: 'var(--ink-40)',
              letterSpacing: '.12em',
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            {shareMsg}
          </div>
        )}

        {saveError && (
          <div
            className="mono"
            style={{
              position: 'absolute',
              bottom: 24,
              left: 24,
              fontSize: 10,
              color: 'var(--ink-40)',
              letterSpacing: '.12em',
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
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
