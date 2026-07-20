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
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
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
import { collabUserColors } from '@/lib/codemirror/collabColors'
import { peersFromAwareness, type CollabPeer } from '@/lib/codemirror/collabPresence'
import {
  observeSceneChanges,
  readSceneFromYjs,
  sceneHasContent,
  sceneToJSON,
  writeSceneToYjs,
  type ScenePayload,
} from '@/lib/collab/excalidrawYjsDoc'
import { fetchInitialScene } from '@/lib/api/rooms'
import {
  applyWsEnvelope,
  applyWsEnvelopes,
  bytesToB64,
  handleCollabSideEffect,
  useEditorWs,
  type EditorWsEnvelope,
} from '@/lib/ws/collabEditor'

export type CollabExcalidrawHandle = {
  getSceneJSON: () => string
  reconnect: () => void
}

type Props = {
  roomId: string
  boardTheme?: LiveRoomTheme
  /** Stable presence id (JWT subject or guest display name). */
  userId: string
  displayName?: string
  /** Guest JWT for the collab websocket. */
  accessToken: string
  onPeersChange?: (peers: CollabPeer[]) => void
  onWsStatusChange?: (status: import('@/lib/ws/collabEditor').EditorWsStatus) => void
  onRoomClosed?: () => void
}

type ExcalidrawApi = {
  updateScene: (scene: {
    elements?: readonly unknown[]
    files?: Record<string, unknown>
    appState?: Record<string, unknown>
    captureUpdate?: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction]
  }) => void
  getSceneElements: () => readonly unknown[]
}

type ColoredElement = Parameters<typeof canonicalizeElementsForStorage>[0][number]

function isTabActive(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus()
}

export const CollabExcalidrawEditor = forwardRef<CollabExcalidrawHandle, Props>(
  function CollabExcalidrawEditor(
    {
      roomId,
      boardTheme = 'dark',
      userId,
      displayName,
      accessToken,
      onPeersChange,
      onWsStatusChange,
      onRoomClosed,
    },
    ref,
  ) {
    const ydocRef = useRef<Y.Doc | null>(null)
    const awarenessRef = useRef<Awareness | null>(null)
    const apiRef = useRef<ExcalidrawApi | null>(null)
    const boardThemeRef = useRef<BoardCanvasTheme>(boardTheme)
    boardThemeRef.current = boardTheme
    const applyingRemoteRef = useRef(false)
    const applyingThemeRef = useRef(false)
    const remoteApplyTimerRef = useRef<number | null>(null)
    const skipChangeRef = useRef(true)
    const wsSendRef = useRef<(env: EditorWsEnvelope) => boolean>(() => false)
    const sendRef = useRef<(update: Uint8Array) => void>(() => {})
    const sendSnapshotRef = useRef<(full: Uint8Array) => void>(() => {})
    const sendAwarenessRef = useRef<(update: Uint8Array) => void>(() => {})
    const pendingEnvelopesRef = useRef<EditorWsEnvelope[]>([])
    const gotRemoteRef = useRef(false)
    const pendingLocalRef = useRef<ScenePayload | null>(null)
    const localRafRef = useRef(0)
    const canPublishLocalRef = useRef(false)

    const [ready, setReady] = useState(false)
    const [seedError, setSeedError] = useState<string | null>(null)
    const seedFailedRef = useRef(false)
    /** Last board theme we imperatively applied — distinguishes real toggles from initial mount. */
    const prevThemeRef = useRef<BoardCanvasTheme | null>(null)

    const onRoomClosedRef = useRef(onRoomClosed)
    onRoomClosedRef.current = onRoomClosed

    const token = accessToken
    if (!token) throw new Error('CollabExcalidrawEditor: accessToken required')

    const handleWsEnvelope = useCallback((env: EditorWsEnvelope) => {
      handleCollabSideEffect(env, {
        onRoomClosed: () => onRoomClosedRef.current?.(),
      })
      const ydoc = ydocRef.current
      const awareness = awarenessRef.current
      if (!ydoc) {
        pendingEnvelopesRef.current.push(env)
        return
      }
      applyWsEnvelope(env, ydoc, awareness)
      if (env.kind === 'snapshot') {
        canPublishLocalRef.current = true
        gotRemoteRef.current = true
      }
    }, [])

    const flushPendingEnvelopes = useCallback(() => {
      const ydoc = ydocRef.current
      const awareness = awarenessRef.current
      if (!ydoc) return
      const pending = pendingEnvelopesRef.current
      if (pending.length === 0) return
      pendingEnvelopesRef.current = []
      for (const env of pending) {
        handleCollabSideEffect(env, {
          onRoomClosed: () => onRoomClosedRef.current?.(),
        })
        if (env.kind === 'snapshot') {
          canPublishLocalRef.current = true
          gotRemoteRef.current = true
        }
      }
      applyWsEnvelopes(pending, ydoc, awareness)
    }, [])

    const { send, status, reconnect } = useEditorWs(roomId, token || undefined, handleWsEnvelope)
    wsSendRef.current = send

    useEffect(() => {
      onWsStatusChange?.(status)
    }, [status, onWsStatusChange])

    useImperativeHandle(ref, () => ({
      getSceneJSON: () => (ydocRef.current ? sceneToJSON(ydocRef.current) : ''),
      reconnect,
    }))

    const flushLocalToYjs = useCallback(() => {
      const pending = pendingLocalRef.current
      const ydoc = ydocRef.current
      if (!pending || !ydoc) return
      pendingLocalRef.current = null
      writeSceneToYjs(ydoc, pending.elements, pending.files, 'local')
    }, [])

    const pushSceneToExcalidraw = useCallback((scene: ScenePayload) => {
      if (!apiRef.current || applyingRemoteRef.current || applyingThemeRef.current) return

      if (remoteApplyTimerRef.current) window.clearTimeout(remoteApplyTimerRef.current)
      applyingRemoteRef.current = true
      try {
        apiRef.current.updateScene({
          elements: boardThemeSceneFromCanonical(
            scene.elements as Parameters<typeof boardThemeSceneFromCanonical>[0],
            boardThemeRef.current,
          ),
          files: scene.files,
          captureUpdate: CaptureUpdateAction.NEVER,
        })
      } finally {
        remoteApplyTimerRef.current = window.setTimeout(() => {
          applyingRemoteRef.current = false
          remoteApplyTimerRef.current = null
        }, 100)
      }
    }, [])

    useEffect(() => {
      canPublishLocalRef.current = false
      gotRemoteRef.current = false
      prevThemeRef.current = null
      seedFailedRef.current = false
      setSeedError(null)
      const ydoc = new Y.Doc()
      ydocRef.current = ydoc
      const awareness = new Awareness(ydoc)
      awarenessRef.current = awareness

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
          // Allow local edits once initial scene seed is done. Do not gate on peer
          // count — with 2+ clients connected, awareness size is always > 1 and
          // edits would never sync without a prior remote snapshot.
          window.setTimeout(() => {
            if (!gotRemoteRef.current && !seedFailedRef.current) {
              canPublishLocalRef.current = true
            }
          }, 300)
        })

      if (!userId) throw new Error('CollabExcalidrawEditor: userId required')
      const label = displayName?.trim() || userId.slice(0, 8)
      const colors = collabUserColors(userId)
      const syncLocalUser = (active = isTabActive()) => {
        awareness.setLocalStateField('user', {
          name: label,
          color: colors.color,
          colorLight: colors.colorLight,
          userId,
          active,
        })
      }
      syncLocalUser()

      const emitPeers = () => onPeersChange?.(peersFromAwareness(awareness))
      const onTabActivity = () => syncLocalUser(isTabActive())
      document.addEventListener('visibilitychange', onTabActivity)
      window.addEventListener('focus', onTabActivity)
      window.addEventListener('blur', onTabActivity)
      awareness.on('change', emitPeers)
      emitPeers()

      let snapshotTimer: number | null = null
      const sendFullSnapshot = () => {
        const full = Y.encodeStateAsUpdate(ydoc)
        if (full.byteLength > 0) sendSnapshotRef.current(full)
      }
      const scheduleSnapshot = () => {
        if (snapshotTimer !== null) window.clearTimeout(snapshotTimer)
        snapshotTimer = window.setTimeout(() => {
          snapshotTimer = null
          sendFullSnapshot()
        }, 1500)
      }

      const stopObserving = observeSceneChanges(ydoc, (scene) => {
        pushSceneToExcalidraw(scene)
      })

      const onAfterTransaction = (tr: Y.Transaction) => {
        if (tr.origin !== 'remote') return
        gotRemoteRef.current = true
        if (tr.changedParentTypes.size > 0) {
          canPublishLocalRef.current = true
        }
      }
      ydoc.on('afterTransaction', onAfterTransaction)

      const onYUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin === 'remote' || origin === 'seed') return
        if (!canPublishLocalRef.current) return
        sendRef.current(update)
        scheduleSnapshot()
      }
      ydoc.on('update', onYUpdate)

      const onAwUpdate = (
        diff: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        if (origin === 'remote') return
        const changed = diff.added.concat(diff.updated, diff.removed)
        if (changed.length === 0) return
        sendAwarenessRef.current?.(encodeAwarenessUpdate(awareness, changed))
      }
      awareness.on('update', onAwUpdate)

      sendRef.current = (update) => {
        wsSendRef.current({ kind: 'op', data: { payload: bytesToB64(update) } })
      }
      sendSnapshotRef.current = (full) => {
        wsSendRef.current({ kind: 'snapshot', data: { payload: bytesToB64(full) } })
      }
      sendAwarenessRef.current = (update) => {
        wsSendRef.current({ kind: 'presence', data: { update: bytesToB64(update) } })
      }

      flushPendingEnvelopes()

      return () => {
        pendingEnvelopesRef.current = []
        if (localRafRef.current) cancelAnimationFrame(localRafRef.current)
        if (remoteApplyTimerRef.current) window.clearTimeout(remoteApplyTimerRef.current)
        try {
          if (canPublishLocalRef.current) sendFullSnapshot()
        } catch (err) {
          console.error('[CollabExcalidraw] final snapshot failed', err)
        }
        stopObserving()
        ydoc.off('afterTransaction', onAfterTransaction)
        document.removeEventListener('visibilitychange', onTabActivity)
        window.removeEventListener('focus', onTabActivity)
        window.removeEventListener('blur', onTabActivity)
        awareness.off('change', emitPeers)
        awareness.setLocalState(null)
        if (snapshotTimer !== null) window.clearTimeout(snapshotTimer)
        ydoc.off('update', onYUpdate)
        awareness.off('update', onAwUpdate)
        awareness.destroy()
        ydoc.destroy()
        ydocRef.current = null
        awarenessRef.current = null
        apiRef.current = null
        pendingLocalRef.current = null
        canPublishLocalRef.current = false
        setReady(false)
      }
    }, [roomId, token, displayName, userId, flushPendingEnvelopes, pushSceneToExcalidraw])

    useEffect(() => {
      if (status !== 'open' || !ydocRef.current) return

      flushPendingEnvelopes()

      const ydoc = ydocRef.current
      const mount = () => {
        setReady(true)
      }

      if (gotRemoteRef.current || sceneHasContent(ydoc)) {
        mount()
        return () => setReady(false)
      }

      const poll = window.setInterval(() => {
        if (gotRemoteRef.current || sceneHasContent(ydoc)) {
          window.clearInterval(poll)
          mount()
        }
      }, 50)

      const giveUp = window.setTimeout(() => {
        window.clearInterval(poll)
        mount()
      }, 3000)

      return () => {
        window.clearInterval(poll)
        window.clearTimeout(giveUp)
        setReady(false)
      }
    }, [status, roomId, token, flushPendingEnvelopes])

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

        if (
          !skipChangeRef.current &&
          !applyingRemoteRef.current &&
          !applyingThemeRef.current &&
          boardElementsNeedThemeRemap(typedElements, theme) &&
          apiRef.current
        ) {
          applyingThemeRef.current = true
          const fixed = applyLocalBoardTheme(
            canonicalizeElementsForStorage(typedElements),
            theme,
          )
          apiRef.current.updateScene({
            elements: fixed,
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          })
          window.setTimeout(() => {
            applyingThemeRef.current = false
          }, 100)
          return
        }

        if (
          skipChangeRef.current ||
          applyingRemoteRef.current ||
          applyingThemeRef.current ||
          !canPublishLocalRef.current
        ) {
          return
        }
        const ydoc = ydocRef.current
        if (!ydoc) return
        if (files !== null && files !== undefined && (typeof files !== 'object' || Array.isArray(files))) {
          throw new Error('CollabExcalidrawEditor: invalid files')
        }

        pendingLocalRef.current = {
          elements: canonicalizeElementsForStorage(
            elements as Parameters<typeof canonicalizeElementsForStorage>[0],
          ),
          files: (files as Record<string, unknown> | null | undefined) ?? {},
        }
        if (localRafRef.current) return
        localRafRef.current = requestAnimationFrame(() => {
          localRafRef.current = 0
          flushLocalToYjs()
        })
      },
      [flushLocalToYjs],
    )

    return (
      <div
        className={`${EXCALIDRAW_MOUNT_CLASS} h-full w-full relative`}
        data-board-theme={boardTheme}
        onWheelCapture={(e) => {
          if (e.ctrlKey || e.metaKey) e.preventDefault()
        }}
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
            viewModeEnabled={false}
            excalidrawAPI={(api) => {
              apiRef.current = api as ExcalidrawApi
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
