import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate } from 'y-protocols/awareness'
import { bindExcalidrawYjsDoc } from '@/lib/collab/excalidrawYjsDoc'
import { collabUserColors } from '@/lib/codemirror/collabColors'
import { peersFromAwareness, type CollabPeer } from '@/lib/codemirror/collabPresence'
import {
  applyWsEnvelope,
  applyWsEnvelopes,
  bytesToB64,
  handleCollabSideEffect,
  useEditorWs,
  type CodeRunBroadcast,
  type EditorWsEnvelope,
  type EditorWsStatus,
} from '@/lib/ws/collabEditor'

export type LiveCollabSession = {
  ydoc: Y.Doc
  awareness: Awareness
  status: EditorWsStatus
  reconnect: () => void
  send: (env: EditorWsEnvelope) => boolean
}

type SessionResources = {
  ydoc: Y.Doc
  awareness: Awareness
}

type Options = {
  roomId: string
  accessToken: string
  userId: string
  displayName: string
  onPeersChange?: (peers: CollabPeer[]) => void
  onWsStatusChange?: (status: EditorWsStatus) => void
  onRoomClosed?: () => void
  onRemoteCodeRun?: (payload: CodeRunBroadcast) => void
}

function isTabActive(): boolean {
  return document.visibilityState === 'visible' && document.hasFocus()
}

/**
 * One Y.Doc and one editor socket per live room.
 * Code (`Y.Text code`) and the Excalidraw maps share that document, so a
 * surface switch does not open a second room or a second websocket.
 * Full snapshots wait until the server snapshot is applied, or 300ms on a
 * new room. Incremental ops still go out immediately. A snapshot sent before
 * the server state arrives would replace the hub snapshot.
 */
export function useLiveCollabSession(options: Options): LiveCollabSession | null {
  const {
    roomId,
    accessToken,
    userId,
    displayName,
    onPeersChange,
    onWsStatusChange,
    onRoomClosed,
    onRemoteCodeRun,
  } = options

  const resourcesRef = useRef<SessionResources | null>(null)
  const pendingRef = useRef<EditorWsEnvelope[]>([])
  const canSnapshotRef = useRef(false)
  const sendRef = useRef<(env: EditorWsEnvelope) => boolean>(() => false)
  const onPeersRef = useRef(onPeersChange)
  const onStatusRef = useRef(onWsStatusChange)
  const onRoomClosedRef = useRef(onRoomClosed)
  const onRemoteCodeRunRef = useRef(onRemoteCodeRun)
  const userIdRef = useRef(userId)
  const displayNameRef = useRef(displayName)
  onPeersRef.current = onPeersChange
  onStatusRef.current = onWsStatusChange
  onRoomClosedRef.current = onRoomClosed
  onRemoteCodeRunRef.current = onRemoteCodeRun
  userIdRef.current = userId
  displayNameRef.current = displayName

  const [resources, setResources] = useState<SessionResources | null>(null)

  const handleWsEnvelope = useCallback((env: EditorWsEnvelope) => {
    handleCollabSideEffect(env, {
      onRoomClosed: () => onRoomClosedRef.current?.(),
      onCodeRun: (payload) => onRemoteCodeRunRef.current?.(payload),
    })
    if (env.kind === 'snapshot') canSnapshotRef.current = true
    const current = resourcesRef.current
    if (!current) {
      pendingRef.current.push(env)
      return
    }
    applyWsEnvelope(env, current.ydoc, current.awareness)
  }, [])

  const { send, status, reconnect } = useEditorWs(
    roomId || undefined,
    accessToken || undefined,
    handleWsEnvelope,
  )
  sendRef.current = send

  useLayoutEffect(() => {
    if (!roomId || !accessToken) {
      resourcesRef.current = null
      setResources(null)
      return
    }

    canSnapshotRef.current = false
    const ydoc = new Y.Doc()
    const awareness = new Awareness(ydoc)
    const next = { ydoc, awareness }
    resourcesRef.current = next

    const allowSnapshot = window.setTimeout(() => {
      canSnapshotRef.current = true
    }, 300)

    const sendFullSnapshot = () => {
      if (!canSnapshotRef.current) return
      const full = Y.encodeStateAsUpdate(ydoc)
      if (full.byteLength > 0) {
        sendRef.current({ kind: 'snapshot', data: { payload: bytesToB64(full) } })
      }
    }
    let snapshotTimer: number | null = null
    const scheduleSnapshot = () => {
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer)
      snapshotTimer = window.setTimeout(() => {
        snapshotTimer = null
        sendFullSnapshot()
      }, 1500)
    }

    const onYUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === 'remote' || origin === 'seed') return
      sendRef.current({ kind: 'op', data: { payload: bytesToB64(update) } })
      scheduleSnapshot()
    }
    ydoc.on('update', onYUpdate)
    // Create both surfaces up front so the board exists before the first switch.
    bindExcalidrawYjsDoc(ydoc)
    ydoc.getText('code')

    const syncLocalUser = (active = isTabActive()) => {
      const id = userIdRef.current
      if (!id) return
      const label = displayNameRef.current.trim() || id.slice(0, 8)
      const colors = collabUserColors(id)
      awareness.setLocalStateField('user', {
        name: label,
        color: colors.color,
        colorLight: colors.colorLight,
        userId: id,
        active,
      })
    }
    syncLocalUser()

    const emitPeers = () => {
      onPeersRef.current?.(peersFromAwareness(awareness))
    }
    const onTabActivity = () => syncLocalUser(isTabActive())
    document.addEventListener('visibilitychange', onTabActivity)
    window.addEventListener('focus', onTabActivity)
    window.addEventListener('blur', onTabActivity)
    awareness.on('change', emitPeers)
    emitPeers()

    const onAwUpdate = (
      diff: { added: number[]; updated: number[]; removed: number[] },
      origin: unknown,
    ) => {
      if (origin === 'remote') return
      const changed = diff.added.concat(diff.updated, diff.removed)
      if (changed.length === 0) return
      sendRef.current({ kind: 'presence', data: { update: bytesToB64(encodeAwarenessUpdate(awareness, changed)) } })
    }
    awareness.on('update', onAwUpdate)

    const pending = pendingRef.current
    if (pending.length > 0) {
      pendingRef.current = []
      for (const env of pending) {
        if (env.kind === 'snapshot') canSnapshotRef.current = true
        handleCollabSideEffect(env, {
          onRoomClosed: () => onRoomClosedRef.current?.(),
          onCodeRun: (payload) => onRemoteCodeRunRef.current?.(payload),
        })
      }
      applyWsEnvelopes(pending, ydoc, awareness)
    }

    setResources(next)

    return () => {
      pendingRef.current = []
      window.clearTimeout(allowSnapshot)
      if (snapshotTimer !== null) window.clearTimeout(snapshotTimer)
      document.removeEventListener('visibilitychange', onTabActivity)
      window.removeEventListener('focus', onTabActivity)
      window.removeEventListener('blur', onTabActivity)
      awareness.off('change', emitPeers)
      try {
        sendFullSnapshot()
      } catch (err) {
        console.error('[liveCollab] final snapshot failed', err)
      }
      awareness.setLocalState(null)
      ydoc.off('update', onYUpdate)
      awareness.off('update', onAwUpdate)
      awareness.destroy()
      ydoc.destroy()
      if (resourcesRef.current === next) resourcesRef.current = null
      setResources(null)
    }
  }, [accessToken, roomId])

  useEffect(() => {
    onStatusRef.current?.(status)
  }, [status])

  useEffect(() => {
    const awareness = resourcesRef.current?.awareness
    if (!awareness || !userId) return
    const label = displayName.trim() || userId.slice(0, 8)
    const colors = collabUserColors(userId)
    const prev = awareness.getLocalState()?.user as Record<string, unknown> | undefined
    awareness.setLocalStateField('user', {
      ...prev,
      name: label,
      color: colors.color,
      colorLight: colors.colorLight,
      userId,
    })
  }, [displayName, userId, resources])

  return useMemo(() => {
    if (!resources) return null
    return {
      ydoc: resources.ydoc,
      awareness: resources.awareness,
      status,
      reconnect,
      send,
    }
  }, [reconnect, resources, send, status])
}
