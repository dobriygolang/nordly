import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { CaptureUpdateAction, Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import {
  boardThemeSceneFromCanonical,
  canonicalizeElementsForStorage,
  remapDisplayElementsForBoardTheme,
} from '@/lib/collab/excalidrawBoardColors'
import {
  EXCALIDRAW_MOUNT_CLASS,
  EXCALIDRAW_UI_OPTIONS,
  excalidrawCanvasPatch,
  excalidrawSiteAppState,
  excalidrawThemeFor,
  type BoardCanvasTheme,
} from '@/lib/collab/excalidrawTheme'
import type { LiveRoomTheme } from '@/lib/live/roomTheme'
import { collabUserColors } from '@/lib/codemirror/collabColors'
import { peersFromAwareness, type CollabPeer } from '@/lib/codemirror/collabPresence'
import {
  migrateLegacySceneText,
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
  userId?: string
  displayName?: string
  accessToken?: string
  onPeersChange?: (peers: CollabPeer[]) => void
  onWsStatusChange?: (status: import('@/lib/ws/collabEditor').EditorWsStatus) => void
  onRoomClosed?: () => void
}

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
    const apiRef = useRef<{
      updateScene: (scene: {
        elements?: readonly unknown[]
        files?: Record<string, unknown>
        appState?: Record<string, unknown>
        captureUpdate?: (typeof CaptureUpdateAction)[keyof typeof CaptureUpdateAction]
      }) => void
      getAppState: () => { isLoading?: boolean }
      getSceneElements: () => readonly unknown[]
    } | null>(null)
    const boardThemeRef = useRef<BoardCanvasTheme>(boardTheme)
    boardThemeRef.current = boardTheme
    const applyingRemoteRef = useRef(false)
    const applyingThemeRef = useRef(false)
    const themeApplyTimerRef = useRef<number | null>(null)
    const remoteApplyTimerRef = useRef<number | null>(null)
    const wsSendRef = useRef<(env: EditorWsEnvelope) => boolean>(() => false)
    const sendRef = useRef<(update: Uint8Array) => void>(() => {})
    const sendSnapshotRef = useRef<(full: Uint8Array) => void>(() => {})
    const sendAwarenessRef = useRef<(update: Uint8Array) => void>(() => {})
    const pendingEnvelopesRef = useRef<EditorWsEnvelope[]>([])
    const gotRemoteRef = useRef(false)
    const pendingLocalRef = useRef<ScenePayload | null>(null)
    const localRafRef = useRef(0)
    /** Block local Yjs writes until server snapshot / remote ops are applied. */
    const canPublishLocalRef = useRef(false)

    const [initialScene, setInitialScene] = useState<ScenePayload>({ elements: [], files: {} })
    const [ready, setReady] = useState(false)

    const onRoomClosedRef = useRef(onRoomClosed)
    onRoomClosedRef.current = onRoomClosed

    const token = accessToken ?? ''

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
      if (!apiRef.current || applyingThemeRef.current) return

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
        // Excalidraw may emit onChange after updateScene — hold the guard briefly.
        remoteApplyTimerRef.current = window.setTimeout(() => {
          applyingRemoteRef.current = false
          remoteApplyTimerRef.current = null
        }, 100)
      }
    }, [])

    useEffect(() => {
      if (!token) return

      canPublishLocalRef.current = false
      gotRemoteRef.current = false
      const ydoc = new Y.Doc()
      ydocRef.current = ydoc
      const awareness = new Awareness(ydoc)
      awarenessRef.current = awareness

      migrateLegacySceneText(ydoc)

      void fetchInitialScene(roomId)
        .then((raw) => {
          if (!raw.trim() || gotRemoteRef.current || sceneHasContent(ydoc)) return
          try {
            const parsed = JSON.parse(raw) as {
              elements?: unknown[]
              files?: Record<string, unknown>
            }
            const elements = Array.isArray(parsed.elements) ? parsed.elements : []
            if (elements.length === 0) return
            writeSceneToYjs(ydoc, elements, parsed.files ?? {}, 'seed')
          } catch {
            /* ignore corrupt seed */
          }
        })
        .catch(() => {
          /* optional seed */
        })
        .finally(() => {
          window.setTimeout(() => {
            const awareness = awarenessRef.current
            const peers = awareness ? awareness.getStates().size : 0
            if (!gotRemoteRef.current && peers <= 1) {
              canPublishLocalRef.current = true
            }
          }, 300)
        })

      const label = displayName ?? userId?.slice(0, 8) ?? 'you'
      const colors = collabUserColors(userId ?? roomId)
      const syncLocalUser = (active = isTabActive()) => {
        awareness.setLocalStateField('user', {
          name: label,
          color: colors.color,
          colorLight: colors.colorLight,
          userId: userId ?? roomId,
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

      setInitialScene(readSceneFromYjs(ydoc))
      flushPendingEnvelopes()

      return () => {
        pendingEnvelopesRef.current = []
        if (localRafRef.current) cancelAnimationFrame(localRafRef.current)
        if (remoteApplyTimerRef.current) window.clearTimeout(remoteApplyTimerRef.current)
        if (themeApplyTimerRef.current) window.clearTimeout(themeApplyTimerRef.current)
        try {
          if (canPublishLocalRef.current) sendFullSnapshot()
        } catch {
          /* ignore */
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
      prevBoardThemeRef.current = null
    }, [roomId])

    // Mount editor after WS is open and we have synced state (snapshot or replayed ops).
    useEffect(() => {
      if (status !== 'open' || !ydocRef.current) return

      flushPendingEnvelopes()

      const ydoc = ydocRef.current
      const mount = () => {
        setInitialScene(readSceneFromYjs(ydoc))
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

    const applyBoardTheme = useCallback((theme: BoardCanvasTheme, isThemeChange: boolean) => {
      const api = apiRef.current
      if (!api) return

      if (isThemeChange && localRafRef.current) {
        cancelAnimationFrame(localRafRef.current)
        localRafRef.current = 0
        flushLocalToYjs()
      }

      const elements = isThemeChange
        ? remapDisplayElementsForBoardTheme(
            api.getSceneElements() as Parameters<typeof remapDisplayElementsForBoardTheme>[0],
            theme,
          )
        : undefined

      if (themeApplyTimerRef.current) window.clearTimeout(themeApplyTimerRef.current)
      applyingThemeRef.current = true
      try {
        api.updateScene({
          elements,
          appState: excalidrawCanvasPatch(theme),
          captureUpdate:
            elements && elements.length > 0
              ? CaptureUpdateAction.IMMEDIATELY
              : CaptureUpdateAction.NEVER,
        })
      } finally {
        themeApplyTimerRef.current = window.setTimeout(() => {
          applyingThemeRef.current = false
          themeApplyTimerRef.current = null
        }, 400)
      }
    }, [flushLocalToYjs])

    const prevBoardThemeRef = useRef<BoardCanvasTheme | null>(null)

    useLayoutEffect(() => {
      const api = apiRef.current
      if (!api) return

      let cancelled = false
      const patch = () => {
        if (cancelled) return
        const isThemeChange =
          prevBoardThemeRef.current !== null && prevBoardThemeRef.current !== boardTheme
        applyBoardTheme(boardTheme, isThemeChange)
        prevBoardThemeRef.current = boardTheme
      }

      patch()

      if (api.getAppState().isLoading) {
        const poll = window.setInterval(() => {
          if (cancelled) return
          if (!api.getAppState().isLoading) {
            window.clearInterval(poll)
            patch()
          }
        }, 50)
        return () => {
          cancelled = true
          window.clearInterval(poll)
        }
      }

      return () => {
        cancelled = true
      }
    }, [boardTheme, ready, applyBoardTheme])

    const handleChange = useCallback(
      (elements: readonly unknown[], _appState: unknown, files: unknown) => {
        if (applyingRemoteRef.current || applyingThemeRef.current || !canPublishLocalRef.current) return
        const ydoc = ydocRef.current
        if (!ydoc) return

        pendingLocalRef.current = {
          elements: canonicalizeElementsForStorage(
            elements as Parameters<typeof canonicalizeElementsForStorage>[0],
          ),
          files: (files as Record<string, unknown>) ?? {},
        }
        if (localRafRef.current) return
        localRafRef.current = requestAnimationFrame(() => {
          localRafRef.current = 0
          flushLocalToYjs()
        })
      },
      [flushLocalToYjs],
    )

    if (!token) {
      return <div className="grid h-full place-items-center text-sm text-text-muted">No token</div>
    }

    return (
      <div
        className={`${EXCALIDRAW_MOUNT_CLASS} h-full w-full`}
        data-board-theme={boardTheme}
        onWheelCapture={(e) => {
          if (e.ctrlKey || e.metaKey) e.preventDefault()
        }}
      >
        {ready ? (
          <Excalidraw
            theme={excalidrawThemeFor(boardTheme)}
            initialData={{
              elements: boardThemeSceneFromCanonical(
                initialScene.elements as Parameters<typeof boardThemeSceneFromCanonical>[0],
                boardTheme,
              ) as never[],
              files: initialScene.files as never,
              appState: excalidrawSiteAppState(boardTheme),
            }}
            onChange={handleChange}
            viewModeEnabled={false}
            excalidrawAPI={(api) => {
              apiRef.current = api as typeof apiRef.current
              api.updateScene({
                appState: excalidrawCanvasPatch(boardThemeRef.current),
                captureUpdate: CaptureUpdateAction.NEVER,
              })
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
