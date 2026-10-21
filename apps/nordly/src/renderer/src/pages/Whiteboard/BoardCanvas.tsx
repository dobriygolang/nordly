import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CaptureUpdateAction, Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

import {
  parseSceneJson,
  serializeScene,
  type WhiteboardScene,
} from '@features/whiteboard/api/whiteboardClient';
import {
  NORDLY_EXCALIDRAW_MOUNT_CLASS,
  NORDLY_EXCALIDRAW_UI_OPTIONS,
  nordlyExcalidrawCanvasPatch,
  nordlyExcalidrawInitialAppState,
  type BoardCanvasTheme,
} from '@shared/lib/excalidraw/nordlyTheme';
import {
  mergePersistedAppState,
  sanitizeAppStateForPersistence,
} from '@shared/lib/excalidraw/excalidrawPersist';
import {
  boardThemeSceneFromCanonical,
  canonicalizeElementsForStorage,
  remapDisplayElementsForBoardTheme,
} from '@shared/lib/excalidraw/excalidrawBoardColors';
import { createLatestOnlyWriter } from '@shared/lib/latestOnlyWriter';
import type { LiveCollaborator, LivePointer } from '@nordly-collab/liveCursors';
import {
  inProgressElementIds,
  isBoardGesturing,
  preserveLocalDrafts,
} from '@nordly-collab/liveDraft';

const SAVE_DEBOUNCE_MS = 1500;

type ExcalidrawApi = {
  updateScene: (scene: {
    elements?: readonly unknown[];
    files?: Record<string, unknown>;
    appState?: Record<string, unknown>;
    collaborators?: Map<string, unknown>;
    captureUpdate?: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction];
  }) => void;
  getAppState: () => { viewBackgroundColor?: string; isLoading?: boolean };
  getSceneElements: () => readonly unknown[];
};

export type BoardCanvasHandle = {
  flush: () => Promise<boolean>;
  /** Cancel pending autosave — call before deleting the open board. */
  prepareDelete: () => void;
  getSceneJson: () => string;
  applyRemoteScene: (elements: readonly unknown[], files: Record<string, unknown>) => void;
  applyCollaborators: (peers: readonly LiveCollaborator[]) => void;
};

interface BoardCanvasProps {
  boardId: string;
  sceneJson: string;
  boardTheme: BoardCanvasTheme;
  onSaved: () => void;
  onSaveError: (msg: string) => void;
  onLiveChange?: (
    elements: readonly unknown[],
    files: Record<string, unknown>,
    opts: { gesturing: boolean },
  ) => void;
  collaborating?: boolean;
  onPointerUpdate?: (pointer: LivePointer | null) => void;
}

function paintCollaborators(api: ExcalidrawApi | null, peers: readonly LiveCollaborator[]): void {
  if (!api) return;
  const map = new Map<string, unknown>();
  for (const peer of peers) {
    map.set(String(peer.clientId), {
      username: peer.username,
      color: { background: peer.color, stroke: peer.color },
      pointer: peer.pointer,
      button: peer.pointer?.button ?? 'up',
    });
  }
  api.updateScene({
    collaborators: map,
    captureUpdate: CaptureUpdateAction.NEVER,
  });
}

function buildInitialData(sceneJson: string, boardTheme: BoardCanvasTheme) {
  const parsed = parseSceneJson(sceneJson);
  const canonical = canonicalizeElementsForStorage(
    parsed.elements as Parameters<typeof canonicalizeElementsForStorage>[0],
  );
  return {
    elements: boardThemeSceneFromCanonical(canonical, boardTheme),
    files: parsed.files,
    appState: mergePersistedAppState(
      nordlyExcalidrawInitialAppState(boardTheme),
      parsed.appState,
      boardTheme,
    ),
    canonicalElements: canonical,
  };
}

export const BoardCanvas = forwardRef<BoardCanvasHandle, BoardCanvasProps>(function BoardCanvas(
  { boardId, sceneJson, boardTheme, onSaved, onSaveError, onLiveChange, collaborating = false, onPointerUpdate },
  ref,
) {
  const sceneRef = useRef<WhiteboardScene | null>(null);
  const appStateRef = useRef<Record<string, unknown>>({});
  const skipSaveRef = useRef(true);
  const applyingThemeRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const remoteApplyRafRef = useRef(0);
  const pointerButtonRef = useRef<'up' | 'down'>('up');
  const localDraftIdsRef = useRef<Set<string>>(new Set());
  const onLiveChangeRef = useRef(onLiveChange);
  const onPointerUpdateRef = useRef(onPointerUpdate);
  onLiveChangeRef.current = onLiveChange;
  onPointerUpdateRef.current = onPointerUpdate;
  const themeApplyTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawApi | null>(null);
  const excalidrawApiRef = useRef<ExcalidrawApi | null>(null);
  const collaboratorsRef = useRef<readonly LiveCollaborator[]>([]);
  const onSavedRef = useRef(onSaved);
  const onSaveErrorRef = useRef(onSaveError);
  const boardThemeRef = useRef(boardTheme);
  boardThemeRef.current = boardTheme;
  onSavedRef.current = onSaved;
  onSaveErrorRef.current = onSaveError;

  const initialData = useMemo(
    () => buildInitialData(sceneJson, boardThemeRef.current),
    [sceneJson],
  );

  const sceneWriter = useMemo(
    () =>
      createLatestOnlyWriter<WhiteboardScene>({
        async write(scene) {
          const scenePayload = serializeScene(scene);
          const { updateBoardScene } = await import(
            '@features/whiteboard/api/whiteboardClient'
          );
          await updateBoardScene(boardId, scenePayload);
        },
        onSaved: () => onSavedRef.current(),
        onError: (error) => {
          const message = error instanceof Error ? error.message : String(error);
          onSaveErrorRef.current(message);
        },
      }),
    [boardId],
  );

  const flushSave = useCallback((): Promise<boolean> => {
    return skipSaveRef.current ? Promise.resolve(true) : sceneWriter.flush();
  }, [sceneWriter]);

  const prepareDelete = useCallback(() => {
    skipSaveRef.current = true;
    sceneWriter.discardPending();
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [sceneWriter]);

  useImperativeHandle(
    ref,
    () => ({
      flush: flushSave,
      prepareDelete,
      getSceneJson: () => {
        const scene = sceneRef.current;
        if (!scene) return sceneJson;
        return serializeScene(scene);
      },
      applyRemoteScene: (elements, files) => {
        const api = excalidrawApi;
        const reconciled = preserveLocalDrafts(
          elements,
          sceneRef.current?.elements ?? [],
          localDraftIdsRef.current,
        );
        const canonical = canonicalizeElementsForStorage(
          reconciled as Parameters<typeof canonicalizeElementsForStorage>[0],
        );
        applyingRemoteRef.current = true;
        sceneRef.current = {
          elements: canonical,
          files,
          appState: appStateRef.current,
        };
        sceneWriter.update(sceneRef.current);
        api?.updateScene({
          elements: remapDisplayElementsForBoardTheme(canonical, boardThemeRef.current),
          files: files as never,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        if (remoteApplyRafRef.current) cancelAnimationFrame(remoteApplyRafRef.current);
        remoteApplyRafRef.current = requestAnimationFrame(() => {
          remoteApplyRafRef.current = 0;
          applyingRemoteRef.current = false;
        });
      },
      applyCollaborators: (peers) => {
        collaboratorsRef.current = peers;
        paintCollaborators(excalidrawApiRef.current, peers);
      },
    }),
    [flushSave, prepareDelete, sceneJson, excalidrawApi, sceneWriter],
  );

  const applyCanvasBackground = useCallback(
    (api: ExcalidrawApi, theme: BoardCanvasTheme, isThemeChange: boolean) => {
      const elements = isThemeChange
        ? remapDisplayElementsForBoardTheme(
            api.getSceneElements() as Parameters<typeof remapDisplayElementsForBoardTheme>[0],
            theme,
          )
        : undefined;

      if (isThemeChange && sceneRef.current) {
        sceneRef.current = {
          ...sceneRef.current,
          elements: canonicalizeElementsForStorage(
            api.getSceneElements() as Parameters<typeof canonicalizeElementsForStorage>[0],
          ),
        };
      }

      if (themeApplyTimerRef.current !== null) {
        window.clearTimeout(themeApplyTimerRef.current);
        themeApplyTimerRef.current = null;
      }
      applyingThemeRef.current = true;
      try {
        api.updateScene({
          elements,
          appState: nordlyExcalidrawCanvasPatch(theme),
          captureUpdate:
            elements && elements.length > 0
              ? CaptureUpdateAction.IMMEDIATELY
              : CaptureUpdateAction.NEVER,
        });
      } finally {
        themeApplyTimerRef.current = window.setTimeout(() => {
          applyingThemeRef.current = false;
          themeApplyTimerRef.current = null;
        }, 400);
      }
    },
    [],
  );

  const prevBoardThemeRef = useRef<BoardCanvasTheme | null>(null);

  useEffect(() => {
    skipSaveRef.current = true;
    setExcalidrawApi(null);
    prevBoardThemeRef.current = null;
    const boot = buildInitialData(sceneJson, boardThemeRef.current);
    sceneRef.current = {
      elements: boot.canonicalElements,
      files: boot.files,
      appState: boot.appState,
    };
    const readyTimer = window.setTimeout(() => {
      skipSaveRef.current = false;
    }, 120);
    return () => {
      window.clearTimeout(readyTimer);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (themeApplyTimerRef.current !== null) {
        window.clearTimeout(themeApplyTimerRef.current);
        themeApplyTimerRef.current = null;
      }
      applyingThemeRef.current = false;
      void flushSave();
    };
  }, [boardId, sceneJson, flushSave]);

  useLayoutEffect(() => {
    if (!excalidrawApi) return;

    let cancelled = false;
    const patch = () => {
      if (cancelled) return;
      const isThemeChange =
        prevBoardThemeRef.current !== null && prevBoardThemeRef.current !== boardTheme;
      applyCanvasBackground(excalidrawApi, boardTheme, isThemeChange);
      prevBoardThemeRef.current = boardTheme;
    };

    patch();

    if (excalidrawApi.getAppState().isLoading) {
      const poll = window.setInterval(() => {
        if (cancelled || document.hidden) return;
        if (!excalidrawApi.getAppState().isLoading) {
          window.clearInterval(poll);
          patch();
        }
      }, 50);
      const onVisible = (): void => {
        if (document.visibilityState !== 'visible' || cancelled) return;
        if (!excalidrawApi.getAppState().isLoading) {
          window.clearInterval(poll);
          patch();
        }
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        cancelled = true;
        window.clearInterval(poll);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [excalidrawApi, boardId, boardTheme, applyCanvasBackground]);

  const publishLive = useCallback(
    (
      elements: readonly unknown[],
      files: Record<string, unknown>,
      appState: Record<string, unknown>,
      gesturing: boolean,
    ) => {
      const canonical = canonicalizeElementsForStorage(
        elements as Parameters<typeof canonicalizeElementsForStorage>[0],
      );
      localDraftIdsRef.current = gesturing ? inProgressElementIds(appState) : new Set();
      onLiveChangeRef.current?.(canonical, files, { gesturing });
    },
    [],
  );

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      if (skipSaveRef.current || applyingThemeRef.current || applyingRemoteRef.current) return;
      if (!appState || typeof appState !== 'object' || Array.isArray(appState)) {
        throw new Error('BoardCanvas: invalid appState');
      }
      if (files !== null && files !== undefined && (typeof files !== 'object' || Array.isArray(files))) {
        throw new Error('BoardCanvas: invalid files');
      }
      const app = appState as Record<string, unknown>;
      appStateRef.current = sanitizeAppStateForPersistence(app, boardTheme) ??
        nordlyExcalidrawInitialAppState(boardTheme);
      const nextFiles = (files as Record<string, unknown> | null | undefined) ?? {};
      sceneRef.current = {
        elements: canonicalizeElementsForStorage(
          elements as Parameters<typeof canonicalizeElementsForStorage>[0],
        ),
        files: nextFiles,
        appState: appStateRef.current,
      };
      sceneWriter.update(sceneRef.current);
      const gesturing = isBoardGesturing(app, pointerButtonRef.current);
      publishLive(sceneRef.current.elements, nextFiles, app, gesturing);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [boardTheme, flushSave, publishLive, sceneWriter],
  );

  return (
    <div
      className={`${NORDLY_EXCALIDRAW_MOUNT_CLASS} nordly-whiteboard-canvas`}
      data-board-theme={boardTheme}
      onWheelCapture={(e) => {
        if (e.ctrlKey || e.metaKey) e.preventDefault();
      }}
      onPointerLeave={() => onPointerUpdateRef.current?.(null)}
    >
      <Excalidraw
        key={boardId}
        theme={boardTheme}
        initialData={{
          elements: initialData.elements as never[],
          files: initialData.files as never,
          appState: initialData.appState as never,
        }}
        onChange={handleChange}
        isCollaborating={collaborating}
        onPointerUpdate={
          collaborating
            ? (payload) => {
                const wasDown = pointerButtonRef.current === 'down';
                pointerButtonRef.current = payload.button;
                onPointerUpdateRef.current?.({
                  x: payload.pointer.x,
                  y: payload.pointer.y,
                  tool: payload.pointer.tool,
                  button: payload.button,
                });
                // Pointer-up often arrives after the last onChange still marked gesturing.
                if (wasDown && payload.button === 'up' && sceneRef.current) {
                  publishLive(
                    sceneRef.current.elements,
                    sceneRef.current.files,
                    appStateRef.current,
                    false,
                  );
                }
              }
            : undefined
        }
        onLinkOpen={(element, event) => {
          event.preventDefault();
          const link = typeof element.link === 'string' ? element.link : '';
          let url: URL;
          try {
            url = new URL(link);
          } catch {
            return;
          }
          if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return;
          const open = window.nordly?.shell?.openExternal;
          if (!open) return;
          void open(url.toString());
        }}
        excalidrawAPI={(api) => {
          const typed = api as ExcalidrawApi;
          excalidrawApiRef.current = typed;
          setExcalidrawApi(typed);
          typed.updateScene({
            appState: nordlyExcalidrawCanvasPatch(boardThemeRef.current),
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          paintCollaborators(typed, collaboratorsRef.current);
        }}
        UIOptions={NORDLY_EXCALIDRAW_UI_OPTIONS}
        aiEnabled={false}
        renderTopRightUI={() => null}
      />
    </div>
  );
});
