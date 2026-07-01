import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
  elementsForBoardTheme,
  elementsToCanonicalStorage,
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
  const rawElements = parsed?.elements ?? [];
  return {
    elements: elementsForBoardTheme(
      rawElements as Parameters<typeof elementsForBoardTheme>[0],
      boardTheme,
    ),
    files: parsed?.files ?? {},
    appState: mergePersistedAppState(
      nordlyExcalidrawInitialAppState(boardTheme),
      parsed?.appState,
      boardTheme,
    ),
  };
}

export const BoardCanvas = forwardRef<BoardCanvasHandle, BoardCanvasProps>(function BoardCanvas(
  { boardId, sceneJson, boardTheme, onSaved, onSaveError },
  ref,
) {
  const sceneRef = useRef<WhiteboardScene | null>(null);
  const appStateRef = useRef<Record<string, unknown>>({});
  const skipSaveRef = useRef(true);
  const saveTimerRef = useRef<number | null>(null);
  const [excalidrawApi, setExcalidrawApi] = useState<ExcalidrawApi | null>(null);
  const onSavedRef = useRef(onSaved);
  const onSaveErrorRef = useRef(onSaveError);
  const boardThemeRef = useRef(boardTheme);
  boardThemeRef.current = boardTheme;
  onSavedRef.current = onSaved;
  onSaveErrorRef.current = onSaveError;

  const initialData = useMemo(
    () => buildInitialData(sceneJson, boardTheme),
    [boardId, sceneJson, boardTheme],
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
    (api: ExcalidrawApi, theme: BoardCanvasTheme, prevTheme: BoardCanvasTheme | null) => {
      let elements: unknown[] | undefined;
      if (prevTheme !== null && prevTheme !== theme) {
        const canonical = elementsToCanonicalStorage(
          api.getSceneElements() as Parameters<typeof elementsToCanonicalStorage>[0],
          prevTheme,
        );
        elements = elementsForBoardTheme(canonical, theme);
      }

      api.updateScene({
        elements,
        appState: nordlyExcalidrawCanvasPatch(theme),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [],
  );

  const prevBoardThemeRef = useRef<BoardCanvasTheme | null>(null);

  useEffect(() => {
    skipSaveRef.current = true;
    setExcalidrawApi(null);
    prevBoardThemeRef.current = null;
    sceneRef.current = {
      elements: initialData.elements,
      files: initialData.files,
      appState: initialData.appState,
    };
    const readyTimer = window.setTimeout(() => {
      skipSaveRef.current = false;
    }, 120);
    return () => {
      window.clearTimeout(readyTimer);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      void flushSave();
    };
  }, [boardId, initialData, flushSave]);

  useEffect(() => {
    if (!excalidrawApi) return;

    let cancelled = false;
    const patch = () => {
      if (cancelled) return;
      applyCanvasBackground(excalidrawApi, boardTheme, prevBoardThemeRef.current);
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
      if (skipSaveRef.current) return;
      appStateRef.current = sanitizeAppStateForPersistence(
        (appState as Record<string, unknown>) ?? {},
        boardTheme,
      ) ?? nordlyExcalidrawInitialAppState(boardTheme);
      sceneRef.current = {
        elements: elementsToCanonicalStorage(
          elements as Parameters<typeof elementsToCanonicalStorage>[0],
          boardThemeRef.current,
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
        excalidrawAPI={(api) => setExcalidrawApi(api as ExcalidrawApi)}
        UIOptions={NORDLY_EXCALIDRAW_UI_OPTIONS}
        aiEnabled={false}
        renderTopRightUI={() => null}
      />
    </div>
  );
});
