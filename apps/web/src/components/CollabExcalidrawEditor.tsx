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

/** Flush canvas → Yjs before remounting Excalidraw on theme change. */
function syncCanvasToYjs(
  api: ExcalidrawApi,
  ydoc: Y.Doc,
  pending: ScenePayload | null,
): void {
  if (pending) {
    writeSceneToYjs(ydoc, pending.elements, pending.files, 'local')
    return
  }
  const scene = readSceneFromYjs(ydoc)
  writeSceneToYjs(
    ydoc,
    canonicalizeElementsForStorage(
      api.getSceneElements() as Parameters<typeof canonicalizeElementsForStorage>[0],
    ),
    scene.files,
    'local',
  )
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
    /** Excalidraw mounts/remounts against this theme (synced from boardTheme via layout effect). */
    const [mountedTheme, setMountedTheme] = useState<BoardCanvasTheme>(boardTheme)

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
      if (!token) return

      canPublishLocalRef.current = false
      gotRemoteRef.current = false
      setMountedTheme(boardTheme)
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

      flushPendingEnvelopes()

      return () => {
        pendingEnvelopesRef.current = []
        if (localRafRef.current) cancelAnimationFrame(localRafRef.current)
        if (remoteApplyTimerRef.current) window.clearTimeout(remoteApplyTimerRef.current)
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

    // Sync canvas → Yjs, then remount Excalidraw with fresh initialData for the new theme.
    useLayoutEffect(() => {
      if (boardTheme === mountedTheme) return

      applyingThemeRef.current = true
      skipChangeRef.current = true

      const api = apiRef.current
      const ydoc = ydocRef.current
      if (api && ydoc) {
        if (localRafRef.current) {
          cancelAnimationFrame(localRafRef.current)
          localRafRef.current = 0
        }
        syncCanvasToYjs(api, ydoc, pendingLocalRef.current)
        pendingLocalRef.current = null
      }

      apiRef.current = null
      setMountedTheme(boardTheme)
    }, [boardTheme, mountedTheme])

    const excalidrawInitialData = useMemo(() => {
      if (!ready) return null
      const ydoc = ydocRef.current
      if (!ydoc) return null
      const scene = readSceneFromYjs(ydoc)
      return {
        elements: boardThemeSceneFromCanonical(
          scene.elements as Parameters<typeof boardThemeSceneFromCanonical>[0],
          mountedTheme,
        ),
        files: scene.files,
        appState: excalidrawSiteAppState(mountedTheme),
      }
    }, [ready, roomId, mountedTheme])

    useEffect(() => {
      if (!ready) return
      skipChangeRef.current = true
      applyingThemeRef.current = true
      const timer = window.setTimeout(() => {
        skipChangeRef.current = false
        applyingThemeRef.current = false
      }, 600)
      return () => window.clearTimeout(timer)
    }, [ready, roomId, mountedTheme])

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
        data-board-theme={mountedTheme}
        onWheelCapture={(e) => {
          if (e.ctrlKey || e.metaKey) e.preventDefault()
        }}
      >
        {ready && excalidrawInitialData ? (
          <Excalidraw
            key={`${roomId}-${mountedTheme}`}
            theme={excalidrawThemeFor(mountedTheme)}
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
