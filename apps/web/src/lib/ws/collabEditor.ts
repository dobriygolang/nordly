import { useCallback, useEffect, useRef, useState } from 'react'

import { CollabSocket } from '@nordly-collab/collabSocket'
import type { EditorWsEnvelope, EditorWsStatus } from '@nordly-collab/wsProtocol'

export {
  EDITOR_WS_KINDS,
  EDITOR_WS_STATUSES,
  applyWsEnvelope,
  applyWsEnvelopes,
  b64ToBytes,
  bytesToB64,
  decodeYjsPayload,
  extractPresenceUpdate,
  handleCollabSideEffect,
  parseEditorWsEnvelope,
  shouldRetryEditorWsClose,
} from '@nordly-collab/wsProtocol'
export type {
  CodeRunBroadcast,
  CollabSideEffectHandlers,
  EditorWsEnvelope,
  EditorWsKind,
  EditorWsStatus,
} from '@nordly-collab/wsProtocol'

export function useEditorWs(
  roomId: string | undefined,
  token: string | undefined,
  onEnvelope?: (env: EditorWsEnvelope) => void,
) {
  const [status, setStatus] = useState<EditorWsStatus>('connecting')
  const socketRef = useRef<CollabSocket | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  const onEnvelopeRef = useRef(onEnvelope)
  onEnvelopeRef.current = onEnvelope

  useEffect(() => {
    if (!roomId || !token) {
      setStatus('closed')
      return
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const base =
      (import.meta.env.VITE_WS_BASE as string | undefined) || `${proto}//${window.location.host}/ws`
    const url = `${base.replace(/\/$/, '')}/editor/${encodeURIComponent(roomId)}`
    const socket = new CollabSocket({
      url,
      token,
      onEnvelope: (env) => onEnvelopeRef.current?.(env),
      onStatus: (status, close) => {
        if (status === 'failed' && close) console.error('[collabEditor] socket failed', close.code);
        setStatus(status);
      },
      onProtocolError: (err) => console.error('[collabEditor] corrupt WS envelope', err),
    })
    socketRef.current = socket
    socket.start()
    return () => {
      socket.stop()
      if (socketRef.current === socket) socketRef.current = null
    }
  }, [roomId, token, reconnectKey])

  const send = useCallback((env: EditorWsEnvelope) => socketRef.current?.send(env) ?? false, [])

  const reconnect = useCallback(() => {
    setReconnectKey((n) => n + 1)
  }, [])

  return { status, send, reconnect }
}
