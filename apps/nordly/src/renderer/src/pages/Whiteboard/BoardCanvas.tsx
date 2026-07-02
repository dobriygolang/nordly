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
} from '@features/whiteboard/repository/whiteboardStore';
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

const SAVE_DEBOUNCE_MS = 1500;

type ExcalidrawApi = {
  updateScene: (scene: {
    elements?: readonly unknown[];
    appState?: Record<string, unknown>;
    captureUpdate?: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction];
  }) => void;
  getAppState: () => { viewBackgroundColor?: string; isLoading?: boolean };
  getSceneElements: () => readonly unknown[];
};

export type BoardCanvasHandle = {
  flush: () => Promise<void>;
  /** Cancel pending autosave — call before deleting the open board. */
  prepareDelete: () => void;
  getSceneJson: () => string;
};

interface BoardCanvasProps {
  boardId: string;
  sceneJson: string;
  boardTheme: BoardCanvasTheme;
  onSaved: () => void;
  onSaveError: (msg: string) => void;
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
  { boardId, sceneJson, boardTheme, onSaved, onSaveError },
  ref,
) {
  const sceneRef = useRef<WhiteboardScene | null>(null);
  const appStateRef = useRef<Record<string, unknown>>({});
  const skipSaveRef = useRef(true);
  const applyingThemeRef = useRef(false);
  const themeApplyTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawApi | null>(null);
  const onSavedRef = useRef(onSaved);
  const onSaveErrorRef = useRef(onSaveError);
  const boardThemeRef = useRef(boardTheme);
  boardThemeRef.current = boardTheme;
  onSavedRef.current = onSaved;
  onSaveErrorRef.current = onSaveError;

  const initialData = useMemo(
    () => buildInitialData(sceneJson, boardThemeRef.current),
    [boardId, sceneJson],
  );

  const flushSave = useCallback(async () => {
    if (skipSaveRef.current) return;
    const scene = sceneRef.current;
    if (!scene) return;
    const { updateBoardScene } = await import('@features/whiteboard/api/whiteboardClient');
    try {
      await updateBoardScene(boardId, serializeScene(scene));
      onSavedRef.current();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onSaveErrorRef.current(msg);
    }
  }, [boardId]);

  const prepareDelete = useCallback(() => {
    skipSaveRef.current = true;
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

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
    }),
    [flushSave, prepareDelete, sceneJson],
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

      if (themeApplyTimerRef.current) window.clearTimeout(themeApplyTimerRef.current);
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
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
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
        if (cancelled) return;
        if (!excalidrawApi.getAppState().isLoading) {
          window.clearInterval(poll);
          patch();
        }
      }, 50);
      return () => {
        cancelled = true;
        window.clearInterval(poll);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [excalidrawApi, boardId, boardTheme, applyCanvasBackground]);

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: unknown, files: unknown) => {
      if (skipSaveRef.current || applyingThemeRef.current) return;
      appStateRef.current = sanitizeAppStateForPersistence(
        (appState as Record<string, unknown>) ?? {},
        boardTheme,
      ) ?? nordlyExcalidrawInitialAppState(boardTheme);
      sceneRef.current = {
        elements: canonicalizeElementsForStorage(
          elements as Parameters<typeof canonicalizeElementsForStorage>[0],
        ),
        files: (files as Record<string, unknown>) ?? {},
        appState: appStateRef.current,
      };
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        void flushSave();
      }, SAVE_DEBOUNCE_MS);
    },
    [boardTheme, flushSave],
  );

  return (
    <div
      className={`${NORDLY_EXCALIDRAW_MOUNT_CLASS} nordly-whiteboard-canvas`}
      data-board-theme={boardTheme}
      onWheelCapture={(e) => {
        if (e.ctrlKey || e.metaKey) e.preventDefault();
      }}
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
        excalidrawAPI={(api) => {
          setExcalidrawApi(api as ExcalidrawApi);
          api.updateScene({
            appState: nordlyExcalidrawCanvasPatch(boardThemeRef.current),
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }}
        UIOptions={NORDLY_EXCALIDRAW_UI_OPTIONS}
        aiEnabled={false}
        renderTopRightUI={() => null}
      />
    </div>
  );
});
