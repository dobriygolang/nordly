import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CaptureUpdateAction, Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { collaboratorsFromAwareness, setLocalCursor, type LivePointer } from '@nordly-collab/liveCursors'
import type * as Y from 'yjs'
import {
  applyLocalBoardTheme,
  boardElementsNeedThemeRemap,
  boardThemeSceneFromCanonical,
  canonicalizeElementsForStorage,
} from '@/lib/collab/excalidrawBoardColors'
import {
  EXCALIDRAW_MOUNT_CLASS,
  EXCALIDRAW_UI_OPTIONS,
  excalidrawCanvasPatch,
  excalidrawSiteAppState,
  type BoardCanvasTheme,
} from '@/lib/collab/excalidrawTheme'
import type { LiveRoomTheme } from '@/lib/live/roomTheme'
import {
  observeSceneChanges,
  readSceneFromYjs,
  sceneHasContent,
  sceneToJSON,
  writeSceneToYjs,
  type ScenePayload,
} from '@/lib/collab/excalidrawYjsDoc'
import { fetchInitialScene } from '@/lib/api/rooms'
import type { LiveCollabSession } from '@/lib/ws/useLiveCollabSession'

export type CollabExcalidrawHandle = {
  getSceneJSON: () => string
}

type Props = {
  session: LiveCollabSession
  roomId: string
  boardTheme?: LiveRoomTheme
  /** Stable presence id (JWT subject). */
  userId: string
}

type ExcalidrawApi = {
  updateScene: (scene: {
    elements?: readonly unknown[]
    files?: Record<string, unknown>
    appState?: Record<string, unknown>
    collaborators?: Map<string, unknown>
    captureUpdate?: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction]
  }) => void
  getSceneElements: () => readonly unknown[]
}

type ColoredElement = Parameters<typeof canonicalizeElementsForStorage>[0][number]

export const CollabExcalidrawEditor = forwardRef<CollabExcalidrawHandle, Props>(
  function CollabExcalidrawEditor(
    {
      session,
      roomId,
      boardTheme = 'dark',
      userId,
    },
    ref,
  ) {
    const ydocRef = useRef<Y.Doc | null>(session.ydoc)
    ydocRef.current = session.ydoc
    const apiRef = useRef<ExcalidrawApi | null>(null)
    const boardThemeRef = useRef<BoardCanvasTheme>(boardTheme)
    boardThemeRef.current = boardTheme
    const applyingRemoteRef = useRef(false)
    const applyingThemeRef = useRef(false)
    const remoteApplyTimerRef = useRef<number | null>(null)
    const skipChangeRef = useRef(true)
    const gotRemoteRef = useRef(false)
    const pendingLocalRef = useRef<ScenePayload | null>(null)
    const localRafRef = useRef(0)
    const canPublishLocalRef = useRef(false)
    const paintCollaboratorsRef = useRef(() => {})
    const pendingRemoteSceneRef = useRef<ScenePayload | null>(null)
    const pushSceneRef = useRef<(scene: ScenePayload) => void>(() => {})
    const scheduleLocalFlushRef = useRef<() => void>(() => {})
    const pointerFrameRef = useRef(0)
    const pendingPointerRef = useRef<LivePointer | null>(null)
    const reportPointer = (pointer: LivePointer | null): void => {
      pendingPointerRef.current = pointer
      if (pointerFrameRef.current) return
      pointerFrameRef.current = requestAnimationFrame(() => {
        pointerFrameRef.current = 0
        setLocalCursor(session.awareness, pendingPointerRef.current)
      })
    }

    const [ready, setReady] = useState(false)
    const [seedError, setSeedError] = useState<string | null>(null)
    const seedFailedRef = useRef(false)
    /** Last board theme we imperatively applied — distinguishes real toggles from initial mount. */
    const prevThemeRef = useRef<BoardCanvasTheme | null>(null)

    if (!userId) throw new Error('CollabExcalidrawEditor: userId required')

    useImperativeHandle(ref, () => ({
      getSceneJSON: () => sceneToJSON(session.ydoc),
    }), [session])

    const flushLocalToYjs = useCallback(() => {
      const pending = pendingLocalRef.current
      const ydoc = ydocRef.current
      if (!pending || !ydoc) return
      if (
        skipChangeRef.current ||
        applyingRemoteRef.current ||
        applyingThemeRef.current ||
        !canPublishLocalRef.current
      ) {
        return
      }
      pendingLocalRef.current = null
      writeSceneToYjs(ydoc, pending.elements, pending.files, 'local')
    }, [])

    const scheduleLocalFlush = useCallback(() => {
      if (localRafRef.current) return
      localRafRef.current = requestAnimationFrame(() => {
        localRafRef.current = 0
        flushLocalToYjs()
      })
    }, [flushLocalToYjs])
    scheduleLocalFlushRef.current = scheduleLocalFlush

    const pushSceneToExcalidraw = useCallback((scene: ScenePayload) => {
      pendingRemoteSceneRef.current = scene
      const api = apiRef.current
      if (!api || applyingThemeRef.current || applyingRemoteRef.current) return
      const next = pendingRemoteSceneRef.current
      if (!next) return
      pendingRemoteSceneRef.current = null
      applyingRemoteRef.current = true
      try {
        api.updateScene({
          elements: boardThemeSceneFromCanonical(
            next.elements as Parameters<typeof boardThemeSceneFromCanonical>[0],
            boardThemeRef.current,
          ),
          files: next.files,
          captureUpdate: CaptureUpdateAction.NEVER,
        })
      } finally {
        if (remoteApplyTimerRef.current) cancelAnimationFrame(remoteApplyTimerRef.current)
        remoteApplyTimerRef.current = requestAnimationFrame(() => {
          remoteApplyTimerRef.current = null
          applyingRemoteRef.current = false
          const queued = pendingRemoteSceneRef.current
          if (queued) pushSceneRef.current(queued)
        })
      }
    }, [])
    pushSceneRef.current = pushSceneToExcalidraw

    useEffect(() => {
      const ydoc = session.ydoc
      ydocRef.current = ydoc
      canPublishLocalRef.current = false
      gotRemoteRef.current = false
      prevThemeRef.current = null
      seedFailedRef.current = false
      setSeedError(null)

      const failSeed = (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        seedFailedRef.current = true
        setSeedError(message)
      }

      void fetchInitialScene(roomId)
        .then((raw) => {
          if (!raw.trim() || gotRemoteRef.current || sceneHasContent(ydoc)) return
          try {
            const parsed = JSON.parse(raw) as {
              elements?: unknown[]
              files?: Record<string, unknown>
            }
            const elements = Array.isArray(parsed.elements) ? parsed.elements : null
            if (!elements || elements.length === 0) {
              if (parsed.elements !== undefined && !Array.isArray(parsed.elements)) {
                throw new Error('Invalid initial scene: elements must be an array')
              }
              return
            }
            const files =
              parsed.files === undefined || parsed.files === null
                ? null
                : typeof parsed.files === 'object' && !Array.isArray(parsed.files)
                  ? (parsed.files as Record<string, unknown>)
                  : null
            if (!files) throw new Error('Invalid initial scene: files must be an object')
            writeSceneToYjs(ydoc, elements, files, 'seed')
          } catch (err) {
            console.error('[CollabExcalidraw] corrupt initial scene seed', err)
            failSeed(err)
          }
        })
        .catch((err) => {
          console.error('[CollabExcalidraw] failed to load initial scene seed', err)
          failSeed(err)
        })
        .finally(() => {
          window.setTimeout(() => {
            canPublishLocalRef.current = true
            scheduleLocalFlushRef.current()
          }, 300)
        })

      const stopObserving = observeSceneChanges(ydoc, (scene) => {
        pushSceneToExcalidraw(scene)
      })

      const onAfterTransaction = (tr: Y.Transaction) => {
        if (tr.origin !== 'remote') return
        gotRemoteRef.current = true
        canPublishLocalRef.current = true
        scheduleLocalFlushRef.current()
      }
      ydoc.on('afterTransaction', onAfterTransaction)

      return () => {
        if (localRafRef.current) cancelAnimationFrame(localRafRef.current)
        if (remoteApplyTimerRef.current) cancelAnimationFrame(remoteApplyTimerRef.current)
        const pending = pendingLocalRef.current
        if (pending) {
          pendingLocalRef.current = null
          writeSceneToYjs(ydoc, pending.elements, pending.files, 'local')
        }
        stopObserving()
        ydoc.off('afterTransaction', onAfterTransaction)
        apiRef.current = null
        pendingLocalRef.current = null
        canPublishLocalRef.current = false
        setReady(false)
      }
    }, [roomId, session.ydoc, pushSceneToExcalidraw])

    useEffect(() => {
      const ydoc = ydocRef.current
      if (!ydoc) return

      const mount = () => {
        setReady(true)
      }

      if (gotRemoteRef.current || sceneHasContent(ydoc)) {
        mount()
        return
      }

      const poll = window.setInterval(() => {
        if (document.hidden) return
        if (gotRemoteRef.current || sceneHasContent(ydoc)) {
          window.clearInterval(poll)
          mount()
        }
      }, 50)

      const giveUp = window.setTimeout(() => {
        window.clearInterval(poll)
        mount()
      }, 3000)

      const onVisible = (): void => {
        if (document.visibilityState !== 'visible') return
        if (gotRemoteRef.current || sceneHasContent(ydoc)) {
          window.clearInterval(poll)
          mount()
        }
      }
      document.addEventListener('visibilitychange', onVisible)

      return () => {
        window.clearInterval(poll)
        window.clearTimeout(giveUp)
        document.removeEventListener('visibilitychange', onVisible)
      }
    }, [roomId, session.ydoc])

    // Freeze initial scene at mount; theme toggles are applied imperatively below.
    const excalidrawInitialData = useMemo(() => {
      if (!ready) return null
      const ydoc = ydocRef.current
      if (!ydoc) return null
      const scene = readSceneFromYjs(ydoc)
      const theme = boardThemeRef.current
      return {
        elements: boardThemeSceneFromCanonical(
          scene.elements as Parameters<typeof boardThemeSceneFromCanonical>[0],
          theme,
        ),
        files: scene.files,
        appState: excalidrawSiteAppState(theme),
      }
      // Intentionally excludes boardTheme — theme changes go through the effect below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, roomId])

    // Apply board theme imperatively, sourcing colors from Yjs (canonical), not the
    // current canvas. Theme is uncontrolled (no `theme` prop) so appState.theme in
    // updateScene actually takes effect — see excalidraw/excalidraw#5212.
    useLayoutEffect(() => {
      if (!ready) return
      const ydoc = ydocRef.current
      if (!ydoc) return

      const isThemeChange = prevThemeRef.current !== null && prevThemeRef.current !== boardTheme
      prevThemeRef.current = boardTheme

      // Ensure the latest local edit is in Yjs before rebuilding the themed scene.
      if (pendingLocalRef.current) {
        if (localRafRef.current) {
          cancelAnimationFrame(localRafRef.current)
          localRafRef.current = 0
        }
        writeSceneToYjs(
          ydoc,
          pendingLocalRef.current.elements,
          pendingLocalRef.current.files,
          'local',
        )
        pendingLocalRef.current = null
      }

      applyingThemeRef.current = true
      skipChangeRef.current = true

      const apply = () => {
        const api = apiRef.current
        const doc = ydocRef.current
        if (!api || !doc) return
        const scene = readSceneFromYjs(doc)
        api.updateScene({
          elements: boardThemeSceneFromCanonical(
            scene.elements as Parameters<typeof boardThemeSceneFromCanonical>[0],
            boardTheme,
          ),
          appState: excalidrawCanvasPatch(boardTheme),
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        })
      }

      apply()
      // Re-apply after Excalidraw settles its own theme switch (guards against the
      // internal migration clobbering stroke colors on the first toggle).
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (isThemeChange) apply()
        })
      })
      const timer = window.setTimeout(() => {
        applyingThemeRef.current = false
        skipChangeRef.current = false
        scheduleLocalFlushRef.current()
      }, 350)

      return () => {
        cancelAnimationFrame(raf)
        window.clearTimeout(timer)
      }
    }, [ready, roomId, boardTheme])

    const handleChange = useCallback(
      (elements: readonly unknown[], _appState: unknown, files: unknown) => {
        const theme = boardThemeRef.current
        const typedElements = elements as ColoredElement[]

        if (files !== null && files !== undefined && (typeof files !== 'object' || Array.isArray(files))) {
          throw new Error('CollabExcalidrawEditor: invalid files')
        }
        const canonical = canonicalizeElementsForStorage(typedElements)
        if (
          !applyingThemeRef.current &&
          !applyingRemoteRef.current &&
          boardElementsNeedThemeRemap(typedElements, theme) &&
          apiRef.current
        ) {
          applyingThemeRef.current = true
          try {
            apiRef.current.updateScene({
              elements: applyLocalBoardTheme(canonical, theme),
              captureUpdate: CaptureUpdateAction.NEVER,
            })
          } finally {
            applyingThemeRef.current = false
          }
        }

        pendingLocalRef.current = {
          elements: canonical,
          files: (files as Record<string, unknown> | null | undefined) ?? {},
        }
        scheduleLocalFlush()
      },
      [scheduleLocalFlush],
    )

    useEffect(() => {
      const awareness = session.awareness
      const paint = () => {
        const api = apiRef.current
        if (!api) return
        const map = new Map<string, unknown>()
        for (const peer of collaboratorsFromAwareness(awareness)) {
          map.set(String(peer.clientId), {
            username: peer.username,
            color: { background: peer.color, stroke: peer.color },
            pointer: peer.pointer,
            button: peer.pointer?.button ?? 'up',
          })
        }
        api.updateScene({
          collaborators: map,
          captureUpdate: CaptureUpdateAction.NEVER,
        })
      }
      awareness.on('change', paint)
      paintCollaboratorsRef.current = paint
      paint()
      return () => {
        awareness.off('change', paint)
        setLocalCursor(awareness, null)
      }
    }, [session.awareness])

    return (
      <div
        className={`${EXCALIDRAW_MOUNT_CLASS} h-full w-full relative`}
        data-board-theme={boardTheme}
        onWheelCapture={(e) => {
          if (e.ctrlKey || e.metaKey) e.preventDefault()
        }}
        onPointerLeave={() => setLocalCursor(session.awareness, null)}
      >
        {seedError ? (
          <div
            role="alert"
            className="absolute left-4 top-4 z-[25] max-w-md rounded-lg border border-danger/30 bg-surface-1 px-3 py-2 text-xs text-danger shadow-md"
          >
            Failed to load board seed: {seedError}
          </div>
        ) : null}
        {ready && excalidrawInitialData ? (
          <Excalidraw
            key={roomId}
            initialData={{
              elements: excalidrawInitialData.elements as never[],
              files: excalidrawInitialData.files as never,
              appState: excalidrawInitialData.appState as never,
            }}
            onChange={handleChange}
            isCollaborating
            onPointerUpdate={(payload) => {
              reportPointer({
                x: payload.pointer.x,
                y: payload.pointer.y,
                tool: payload.pointer.tool,
                button: payload.button,
              })
            }}
            viewModeEnabled={false}
            excalidrawAPI={(api) => {
              apiRef.current = api as ExcalidrawApi
              paintCollaboratorsRef.current()
            }}
            UIOptions={EXCALIDRAW_UI_OPTIONS}
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-text-muted">Connecting…</div>
        )}
      </div>
    )
  },
)
