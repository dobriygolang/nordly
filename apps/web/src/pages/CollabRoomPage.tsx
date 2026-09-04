import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { CollabCodeEditorHandle } from '@/components/CollabCodeEditor'
import type { CollabExcalidrawHandle } from '@/components/CollabExcalidrawEditor'
import { wsStatusColor } from '@/lib/live/wsStatusColor'

const CollabCodeEditor = lazy(() =>
  import('@/components/CollabCodeEditor').then((m) => ({ default: m.CollabCodeEditor })),
)
const CollabExcalidrawEditor = lazy(() =>
  import('@/components/CollabExcalidrawEditor').then((m) => ({ default: m.CollabExcalidrawEditor })),
)
import { isDesignRoom } from '@/lib/live/roomKind'
import type { CollabPeer } from '@/lib/codemirror/collabPresence'
import { LiveRoomBottomBar } from '@/components/live/LiveRoomBottomBar'
import { LiveRoomTopBar } from '@/components/live/LiveRoomTopBar'
import { RunOutputPanel } from '@/components/live/RunOutputPanel'
import { PublicPageShell } from '@/components/brand/PublicNav'
import { Logo } from '@/components/brand/Logo'
import { brand } from '@/lib/brand/tokens'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ErrorMessage'
import { useFormatCode } from '@/hooks/useFormatCode'
import { useHorizontalResize } from '@/hooks/useHorizontalResize'
import { useSandboxRun } from '@/hooks/useSandboxRun'
import { normalizeEditorLang } from '@/lib/codemirror/langExtension'
import {
  closeRoom,
  getRoom,
  guestJoin,
  persistGuestRoom,
  persistGuestToken,
  clearGuestSession,
  guestSessionExpired,
  isGuestSessionFatalError,
  readGuestRoom,
  readGuestToken,
} from '@/lib/api/rooms'
import { readGuestDisplayName, persistGuestDisplayName } from '@/lib/live/guestDisplayName'
import {
  persistLiveRoomTheme,
  readLiveRoomTheme,
  type LiveRoomTheme,
} from '@/lib/live/roomTheme'
import { liveWsStatusLabel, useI18n } from '@/lib/i18n'
import { runThemeTransition, type ThemeToggleOrigin } from '@/lib/site/themeTransition'
import { liveNewPath, publicLiveRoomUrl } from '@/lib/live/liveRoomUrl'
import {
  clampRunPanelWidth,
  persistRunPanelWidth,
  readRunPanelWidth,
  RUN_PANEL_MIN,
  runPanelMaxWidth,
} from '@/lib/live/runPanelWidth'
import { cn } from '@/lib/cn'

function jwtSubject(token: string): string {
  const part = token.split('.')[1]
  if (!part) throw new Error('Invalid guest token: missing payload')
  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(padded)) as { sub?: string }
    if (typeof json.sub !== 'string' || !json.sub) {
      throw new Error('Invalid guest token: missing sub')
    }
    return json.sub
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid guest token:')) throw err
    console.error('[live] jwtSubject decode failed', err)
    throw new Error('Invalid guest token: bad payload')
  }
}

export default function CollabRoomPage() {
  const { t } = useI18n()
  const { roomId = '' } = useParams()
  const navigate = useNavigate()
  const codeEditorRef = useRef<CollabCodeEditorHandle>(null)
  const diagramEditorRef = useRef<CollabExcalidrawHandle>(null)
  const [copied, setCopied] = useState(false)
  const [wsStatus, setWsStatus] = useState<import('@/lib/ws/collabEditor').EditorWsStatus>('connecting')
  const [guestName, setGuestName] = useState(() => readGuestDisplayName())
  const [guestToken, setGuestToken] = useState(() => readGuestToken(roomId))
  const [guestRoom, setGuestRoom] = useState<import('@/lib/api/rooms').CodeRoom | null>(() =>
    readGuestRoom(roomId),
  )
  const [fontSize, setFontSize] = useState(14)
  const [peers, setPeers] = useState<CollabPeer[]>([])
  const [theme, setTheme] = useState<LiveRoomTheme>(() => readLiveRoomTheme())
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true)
  const [runPanelWidth, setRunPanelWidth] = useState(readRunPanelWidth)
  const { isResizing: isRunPanelResizing, start: startRunPanelResize } =
    useHorizontalResize(setRunPanelWidth)
  const hasSession = !!guestToken && !guestSessionExpired(roomId)

  useEffect(() => {
    setGuestToken(readGuestToken(roomId))
    setGuestRoom(readGuestRoom(roomId))
  }, [roomId])

  useEffect(() => {
    const onResize = () => {
      setRunPanelWidth((w) => clampRunPanelWidth(w))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!isRunPanelResizing) persistRunPanelWidth(runPanelWidth)
  }, [isRunPanelResizing, runPanelWidth])

  const roomQ = useQuery({
    queryKey: ['room', roomId],
    queryFn: () => getRoom(roomId),
    enabled: !!roomId && hasSession,
    retry: false,
  })

  useEffect(() => {
    if (roomQ.data) persistGuestRoom(roomId, roomQ.data)
  }, [roomId, roomQ.data])

  const guestJoinM = useMutation({
    mutationFn: () => {
      const name = guestName.trim()
      if (!name) throw new Error('display name is required')
      persistGuestDisplayName(name)
      return guestJoin(roomId, name)
    },
    onSuccess: (result) => {
      persistGuestToken(roomId, result.access_token, result.expires_in)
      persistGuestRoom(roomId, result.room)
      setGuestToken(result.access_token)
      setGuestRoom(result.room)
    },
  })

  const handleCopyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(publicLiveRoomUrl(roomId))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn('[collabRoom] clipboard write failed', err)
    }
  }, [roomId])

  const closeM = useMutation({
    mutationFn: () => closeRoom(roomId),
  })

  const wsToken = guestToken
  const run = useSandboxRun(wsToken)
  const fmt = useFormatCode(wsToken)

  const handleRoomExpired = useCallback(() => {
    clearGuestSession(roomId)
    setGuestToken(null)
    setGuestRoom(null)
    navigate('/', { replace: true, state: { liveExpired: true } })
  }, [navigate, roomId])

  useEffect(() => {
    if (!roomQ.isError || !isGuestSessionFatalError(roomQ.error)) return
    handleRoomExpired()
  }, [handleRoomExpired, roomQ.isError, roomQ.error])

  useEffect(() => {
    if (wsStatus !== 'failed' || !roomId || !guestToken) return
    void getRoom(roomId).catch((err: unknown) => {
      if (isGuestSessionFatalError(err)) handleRoomExpired()
    })
  }, [guestToken, handleRoomExpired, roomId, wsStatus])

  useLayoutEffect(() => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(theme === 'light' ? 'light' : 'dark')
    persistLiveRoomTheme(theme)
  }, [theme])

  useEffect(() => {
    if (!fmt.formatError) return
    const id = window.setTimeout(() => fmt.clearFormatError(), 6000)
    return () => window.clearTimeout(id)
  }, [fmt.formatError, fmt.clearFormatError])

  const handleDisplayNameChange = useCallback((name: string) => {
    setGuestName(name)
    const trimmed = name.trim()
    if (trimmed) persistGuestDisplayName(trimmed)
  }, [])

  const handleThemeToggle = useCallback((origin?: ThemeToggleOrigin) => {
    runThemeTransition(() => {
      setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
    }, origin)
  }, [])

  const handleRemoteCodeRun = useCallback(
    (payload: { run_id: string; triggered_by?: string }) => {
      run.followRun(payload.run_id, payload.triggered_by)
    },
    [run],
  )

  if (!roomId.trim()) {
    return (
      <EditorShell
        message={t('live.roomNotFound')}
        action={
          <Link to={liveNewPath()}>
            <Button variant="secondary" size="sm">
              {t('live.createNew')}
            </Button>
          </Link>
        }
      />
    )
  }

  if (!hasSession) {
    return (
      <GuestGate
        guestName={guestName}
        onNameChange={setGuestName}
        error={guestJoinM.error}
        loading={guestJoinM.isPending}
        onJoin={() => guestJoinM.mutate()}
      />
    )
  }

  if (roomQ.isLoading && !guestRoom) {
    return <EditorShell message={t('live.loadingRoom')} />
  }

  const room = roomQ.data ?? guestRoom

  if (!room) {
    return (
      <EditorShell
        message={t('live.roomNotFound')}
        sub={roomQ.error instanceof Error ? roomQ.error.message : undefined}
        action={
          <Link to={liveNewPath()}>
            <Button variant="secondary" size="sm">
              {t('live.createNew')}
            </Button>
          </Link>
        }
      />
    )
  }

  if (!wsToken) {
    return (
      <EditorShell
        message={t('live.roomNotFound')}
        sub="Invalid session token"
        action={
          <Link to={liveNewPath()}>
            <Button variant="secondary" size="sm">
              {t('live.createNew')}
            </Button>
          </Link>
        }
      />
    )
  }

  let sessionUserId: string
  try {
    sessionUserId = jwtSubject(wsToken)
  } catch (err) {
    console.error('[live] invalid session token', err)
    return (
      <EditorShell
        message={t('live.roomNotFound')}
        sub="Invalid session token"
        action={
          <Link to={liveNewPath()}>
            <Button variant="secondary" size="sm">
              {t('live.createNew')}
            </Button>
          </Link>
        }
      />
    )
  }
  const isOwner = sessionUserId === room.owner_id
  const canRun = !!hasSession
  const closeTo = '/'
  const designRoom = isDesignRoom(room)
  const displayName = guestName.trim()

  const handleClose = () => {
    if (isOwner) {
      closeM.mutate(undefined, {
        onSuccess: () => {
          clearGuestSession(roomId)
          navigate(closeTo)
        },
      })
      return
    }
    navigate(closeTo)
  }

  const editorReconnect = () => {
    if (designRoom) diagramEditorRef.current?.reconnect()
    else codeEditorRef.current?.reconnect()
  }

  const handleFormat = async () => {
    const code = codeEditorRef.current?.getCode() ?? ''
    if (!code.trim() || fmt.formatting) return
    const formatted = await fmt.format(room.language, code)
    if (formatted != null) codeEditorRef.current?.setCode(formatted)
  }

  const handleRun = async () => {
    const code = codeEditorRef.current?.getCode() ?? ''
    if (!code.trim()) return
    const runId = await run.executeRun({
      language: room.language,
      code,
      triggeredBy: displayName,
    })
    if (runId) {
      codeEditorRef.current?.broadcastCodeRun({
        run_id: runId,
        triggered_by: displayName,
      })
    }
  }

  const statusLabel = liveWsStatusLabel(t, wsStatus)
  const statusColor = wsStatus === 'open' ? brand.green : wsStatusColor(wsStatus)
  const isGo = !designRoom && normalizeEditorLang(room.language) === 'go'

  return (
    <div className="flex h-[100dvh] flex-col bg-bg text-text-primary">
      <LiveRoomTopBar
        closeTo={closeTo}
        onClose={handleClose}
        closeLoading={closeM.isPending}
        isOwner={isOwner}
        inviteLoading={false}
        inviteCopied={copied}
        onInvite={() => void handleCopyInvite()}
        wsFailed={wsStatus === 'failed'}
        onReconnect={editorReconnect}
        timerMode="countdown"
        createdAt={room.created_at}
        expiresAt={room.expires_at}
        onTimerExpired={handleRoomExpired}
        displayName={guestName}
        onDisplayNameChange={handleDisplayNameChange}
        theme={theme}
        onThemeToggle={handleThemeToggle}
      />

      <div className={cn('flex min-h-0 flex-1', designRoom ? 'bg-bg' : 'bg-surface-1')}>
        {designRoom ? (
          <Suspense fallback={<div className="min-h-0 flex-1 bg-bg" />}>
            <CollabExcalidrawEditor
              ref={diagramEditorRef}
              roomId={room.id}
              boardTheme={theme}
              userId={sessionUserId}
              displayName={displayName}
              accessToken={wsToken}
              onPeersChange={setPeers}
              onWsStatusChange={setWsStatus}
              onRoomClosed={handleRoomExpired}
            />
          </Suspense>
        ) : (
          <>
            <div className="relative min-h-0 min-w-0 flex-1">
              <Suspense fallback={<div className="absolute inset-0 bg-surface-1" />}>
                <CollabCodeEditor
                  ref={codeEditorRef}
                  roomId={room.id}
                  language={room.language}
                  theme={theme}
                  autocompleteEnabled={autocompleteEnabled}
                  userId={sessionUserId}
                  displayName={displayName}
                  accessToken={wsToken}
                  fontSize={fontSize}
                  onRun={canRun ? () => void handleRun() : undefined}
                  onFormat={isGo ? () => void handleFormat() : undefined}
                  onPeersChange={setPeers}
                  onWsStatusChange={setWsStatus}
                  onRoomClosed={handleRoomExpired}
                  onRemoteCodeRun={handleRemoteCodeRun}
                />
              </Suspense>

              {fmt.formatError ? (
                <div
                  role="alert"
                  className="absolute left-4 top-4 z-[25] flex max-w-md items-start gap-2 rounded-lg border border-danger/30 bg-surface-1 px-3 py-2 text-xs text-danger shadow-md"
                >
                  <span className="min-w-0 flex-1 leading-relaxed">{fmt.formatError}</span>
                  <button
                    type="button"
                    onClick={() => fmt.clearFormatError()}
                    className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
                    aria-label={t('live.dismissError')}
                  >
                    ×
                  </button>
                </div>
              ) : null}
            </div>

            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={t('live.resizeOutput')}
              aria-valuenow={runPanelWidth}
              aria-valuemin={RUN_PANEL_MIN}
              aria-valuemax={runPanelMaxWidth()}
              onPointerDown={(e) =>
                startRunPanelResize(e, {
                  baseWidth: runPanelWidth,
                  min: RUN_PANEL_MIN,
                  max: runPanelMaxWidth(),
                  onCommit: persistRunPanelWidth,
                })
              }
              className={cn(
                'group relative z-10 w-1.5 shrink-0 cursor-col-resize touch-none select-none',
                'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border',
                'hover:before:bg-border-strong',
                isRunPanelResizing && 'before:bg-border-strong',
              )}
            />

            <RunOutputPanel
              width={runPanelWidth}
              tab={run.outputTab}
              onTabChange={run.setOutputTab}
              run={run.activeRun}
              running={run.running}
              error={run.runError}
              triggeredBy={run.triggeredBy}
              canRun={canRun}
              onRun={() => void handleRun()}
            />
          </>
        )}
      </div>

      <LiveRoomBottomBar
        mode={designRoom ? 'diagram' : 'code'}
        language={room.language}
        fontSize={fontSize}
        onFontSizeChange={setFontSize}
        peers={peers}
        statusLabel={statusLabel}
        statusColor={statusColor}
        canFormat={isGo && !designRoom}
        formatting={fmt.formatting}
        onFormat={() => void handleFormat()}
        autocompleteEnabled={autocompleteEnabled}
        onAutocompleteChange={setAutocompleteEnabled}
      />
    </div>
  )
}

function EditorShell({
  message,
  sub,
  action,
}: {
  message: string
  sub?: string
  action?: React.ReactNode
}) {
  useEffect(() => {
    document.documentElement.classList.add('light')
  }, [])

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <Logo to="/" />
      <p className="text-sm font-medium text-text-primary">{message}</p>
      {sub ? <p className="max-w-md text-sm leading-relaxed text-text-secondary">{sub}</p> : null}
      {action}
    </div>
  )
}

function GuestGate({
  guestName,
  onNameChange,
  error,
  loading,
  onJoin,
}: {
  guestName: string
  onNameChange: (v: string) => void
  error: unknown
  loading: boolean
  onJoin: () => void
}) {
  const { t } = useI18n()

  return (
    <PublicPageShell>
      <main className="mx-auto flex max-w-lg flex-col items-center px-6 py-16">
        <div className="w-full rounded-2xl border border-site-border bg-site-card p-6 sm:p-7">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-site-text">{t('live.guestTitle')}</h1>
          <p className="mt-2 text-sm leading-relaxed text-site-muted">
            {t('live.guestDescription')}
          </p>
          <label htmlFor="guest-name" className="mt-5 block text-sm font-medium text-site-text">
            {t('live.name')}
          </label>
          <input
            id="guest-name"
            value={guestName}
            onChange={(e) => onNameChange(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-site-border bg-site-bg px-3 py-2.5 text-sm text-site-text outline-none focus:border-site-muted"
            placeholder={t('live.namePlaceholder')}
          />
          {error ? (
            <div className="mt-3">
              <ErrorMessage
                message={error instanceof Error ? error.message : t('live.joinError')}
              />
            </div>
          ) : null}
          <Button
            className="mt-5 w-full"
            loading={loading}
            disabled={!guestName.trim()}
            onClick={onJoin}
          >
            {t('live.joinRoom')}
          </Button>
        </div>
      </main>
    </PublicPageShell>
  )
}
