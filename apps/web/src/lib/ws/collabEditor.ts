import { useCallback, useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { applyAwarenessUpdate } from 'y-protocols/awareness'
import type { Awareness } from 'y-protocols/awareness'

export const EDITOR_WS_KINDS = [
  'snapshot',
  'op',
  'presence',
  'cursor',
  'code_run',
  'room_closed',
] as const
export type EditorWsKind = (typeof EDITOR_WS_KINDS)[number]

export type EditorWsEnvelope = {
  kind: EditorWsKind
  data?: unknown
}

export const EDITOR_WS_STATUSES = [
  'connecting',
  'open',
  'reconnecting',
  'failed',
  'closed',
] as const
export type EditorWsStatus = (typeof EDITOR_WS_STATUSES)[number]

/** Policy and room-closed frames must not be retried; 410 upgrades arrive as 1006. */
export function shouldRetryEditorWsClose(code: number): boolean {
  return code !== 1000 && code !== 1008
}

export function parseEditorWsEnvelope(raw: unknown): EditorWsEnvelope {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid WS envelope')
  }
  const kind = (raw as { kind?: unknown }).kind
  if (typeof kind !== 'string' || !(EDITOR_WS_KINDS as readonly string[]).includes(kind)) {
    throw new Error(`Unknown collab envelope kind: ${String(kind)}`)
  }
  return { kind: kind as EditorWsKind, data: (raw as { data?: unknown }).data }
}

export function decodeYjsPayload(payload: unknown): Uint8Array | null {
  if (payload == null) return null
  if (typeof payload === 'string') return b64ToBytes(payload)
  if (payload instanceof Uint8Array) return payload
  if (Array.isArray(payload)) return new Uint8Array(payload as number[])
  throw new Error(`Invalid Yjs payload type: ${typeof payload}`)
}

export function useEditorWs(
  roomId: string | undefined,
  token: string | undefined,
  onEnvelope?: (env: EditorWsEnvelope) => void,
) {
  const [status, setStatus] = useState<EditorWsStatus>('connecting')
  const wsRef = useRef<WebSocket | null>(null)
  const attemptsRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const closedByUser = useRef(false)
  const failedHard = useRef(false)
  const [reconnectKey, setReconnectKey] = useState(0)
  const onEnvelopeRef = useRef(onEnvelope)
  onEnvelopeRef.current = onEnvelope

  useEffect(() => {
    if (!roomId || !token) {
      setStatus('closed')
      return
    }
    closedByUser.current = false
    failedHard.current = false
    attemptsRef.current = 0

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const base =
      (import.meta.env.VITE_WS_BASE as string | undefined) || `${proto}//${window.location.host}/ws`
    const url = `${base.replace(/\/$/, '')}/editor/${encodeURIComponent(roomId)}`

    const connect = () => {
      setStatus(attemptsRef.current === 0 ? 'connecting' : 'reconnecting')
      const ws = new WebSocket(url, [`access_token.${token}`])
      wsRef.current = ws
      ws.onopen = () => {
        attemptsRef.current = 0
        setStatus('open')
      }
      ws.onmessage = (ev) => {
        try {
          const env = parseEditorWsEnvelope(JSON.parse(ev.data) as unknown)
          onEnvelopeRef.current?.(env)
        } catch (err) {
          console.error('[collabEditor] corrupt WS envelope', err)
          failedHard.current = true
          closedByUser.current = true
          if (timerRef.current) window.clearTimeout(timerRef.current)
          setStatus('failed')
          ws.close()
        }
      }
      ws.onerror = () => {
        /* onclose handles retry */
      }
      ws.onclose = (ev) => {
        if (failedHard.current) {
          setStatus('failed')
          return
        }
        if (closedByUser.current) {
          setStatus('closed')
          return
        }
        if (!shouldRetryEditorWsClose(ev.code)) {
          setStatus(ev.code === 1000 ? 'closed' : 'failed')
          return
        }
        attemptsRef.current += 1
        if (attemptsRef.current > 5) {
          setStatus('failed')
          return
        }
        const backoff = Math.min(10_000, 500 * 2 ** attemptsRef.current)
        timerRef.current = window.setTimeout(connect, backoff)
      }
    }

    connect()

    return () => {
      closedByUser.current = true
      if (timerRef.current) window.clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [roomId, token, reconnectKey])

  const send = useCallback((env: EditorWsEnvelope) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(env))
    return true
  }, [])

  const reconnect = useCallback(() => {
    attemptsRef.current = 0
    setReconnectKey((n) => n + 1)
  }, [])

  return { status, send, reconnect }
}

export function bytesToB64(bytes: Uint8Array): string {
  const CHUNK = 0x2000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function b64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

const ENVELOPE_KIND_ORDER: Partial<Record<EditorWsKind, number>> = {
  snapshot: 0,
  op: 1,
  presence: 2,
}

function envelopeKindOrder(kind: EditorWsKind): number {
  const order = ENVELOPE_KIND_ORDER[kind]
  if (order === undefined) {
    throw new Error(`Unknown collab envelope kind: ${kind}`)
  }
  return order
}

/** Canonical presence payload is `{ update: "<b64>" }`. */
export function extractPresenceUpdate(data: unknown): string {
  if (data == null || typeof data !== 'object') {
    throw new Error('Invalid presence payload')
  }
  const update = (data as Record<string, unknown>).update
  if (typeof update !== 'string' || !update) {
    throw new Error('Invalid presence payload: missing update')
  }
  return update
}

function applyPresenceUpdate(awareness: Awareness, data: unknown): void {
  applyAwarenessUpdate(awareness, b64ToBytes(extractPresenceUpdate(data)), 'remote')
}

const SIDE_EFFECT_KINDS = new Set<EditorWsKind>(['room_closed', 'code_run', 'cursor'])

export function applyWsEnvelope(
  env: EditorWsEnvelope,
  ydoc: Y.Doc,
  awareness: Awareness | null,
): void {
  if (SIDE_EFFECT_KINDS.has(env.kind)) return
  if (env.kind === 'snapshot' || env.kind === 'op') {
    const data = env.data as { payload?: unknown } | undefined
    const bytes = decodeYjsPayload(data?.payload)
    if (!bytes) {
      throw new Error(`collab ${env.kind} missing payload`)
    }
    if (bytes.byteLength > 0) {
      Y.applyUpdate(ydoc, bytes, 'remote')
    }
    return
  }

  if (env.kind === 'presence') {
    if (!awareness) return
    applyPresenceUpdate(awareness, env.data)
    return
  }
  throw new Error(`Unknown collab envelope kind: ${env.kind}`)
}

/** Apply a batch of WS envelopes: doc sync first, then awareness (deferred per envelope). */
export function applyWsEnvelopes(
  envs: EditorWsEnvelope[],
  ydoc: Y.Doc,
  awareness: Awareness | null,
): void {
  const docEnvs = envs.filter(
    (env) => env.kind === 'snapshot' || env.kind === 'op' || env.kind === 'presence',
  )
  const sorted = [...docEnvs].sort(
    (a, b) => envelopeKindOrder(a.kind) - envelopeKindOrder(b.kind),
  )
  for (const env of sorted) {
    if (env.kind === 'snapshot' || env.kind === 'op') {
      applyWsEnvelope(env, ydoc, awareness)
    }
  }
  for (const env of sorted) {
    if (env.kind === 'presence' && awareness) {
      applyPresenceUpdate(awareness, env.data)
    }
  }
}

export type CodeRunBroadcast = {
  run_id: string
  triggered_by?: string
}

export type CollabSideEffectHandlers = {
  onRoomClosed?: () => void
  onCodeRun?: (payload: CodeRunBroadcast) => void
}

export function handleCollabSideEffect(env: EditorWsEnvelope, handlers: CollabSideEffectHandlers): void {
  if (env.kind === 'room_closed') {
    handlers.onRoomClosed?.()
    return
  }
  if (env.kind === 'code_run') {
    const data = env.data as CodeRunBroadcast | undefined
    if (!data?.run_id) {
      throw new Error('collab code_run missing run_id')
    }
    handlers.onCodeRun?.(data)
    return
  }
}
