import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  ApiError,
  accessPublishedNote,
  fetchPublishedNote,
  publishedNoteDisplayTitle,
  type PublishedNote,
} from '@/lib/api/publicNotes'
import { applyDocumentMeta } from '@/lib/site/documentMeta'
import { useI18n } from '@/lib/i18n'

function NoteBody({ bodyMd }: { bodyMd: string }) {
  const blocks = useMemo(() => {
    const trimmed = bodyMd.trim()
    if (!trimmed) return []
    return trimmed.split(/\n{2,}/)
  }, [bodyMd])

  if (blocks.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-zinc-200 leading-7 whitespace-pre-wrap" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => (
        <p key={i} className="text-zinc-200 leading-7 whitespace-pre-wrap break-words">
          {block}
        </p>
      ))}
    </div>
  )
}

function PasswordGate({
  title,
  password,
  error,
  busy,
  onPasswordChange,
  onSubmit,
}: {
  title: string
  password: string
  error: string | null
  busy: boolean
  onPasswordChange: (value: string) => void
  onSubmit: () => void
}) {
  const { t } = useI18n()

  return (
    <div className="w-full max-w-md mx-auto px-6 sm:px-8 relative z-10">
      <h1 className="text-2xl font-bold text-white mb-2">{title}</h1>
      <p className="text-zinc-400 text-sm mb-6">{t('seo.pages.publishedNote.passwordHint')}</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder={t('seo.pages.publishedNote.passwordPlaceholder')}
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
          autoComplete="current-password"
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || password.trim().length === 0}
          className="inline-flex rounded-md bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        >
          {t('seo.pages.publishedNote.passwordSubmit')}
        </button>
      </form>
    </div>
  )
}

export default function PublishedNotePage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useI18n()
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ok'; note: PublishedNote } | { kind: 'error'; status: number }
  >({ kind: 'loading' })
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [unlockBusy, setUnlockBusy] = useState(false)

  useEffect(() => {
    if (!slug) {
      setState({ kind: 'error', status: 404 })
      return
    }
    let live = true
    setState({ kind: 'loading' })
    setPassword('')
    setPasswordError(null)
    void fetchPublishedNote(slug)
      .then((note) => {
        if (live) setState({ kind: 'ok', note })
      })
      .catch((err: unknown) => {
        if (!live) return
        const status = err instanceof ApiError ? err.status : 500
        setState({ kind: 'error', status })
      })
    return () => {
      live = false
    }
  }, [slug])

  const title =
    state.kind === 'ok' ? publishedNoteDisplayTitle(state.note.title) : 'Note not found'

  useEffect(() => {
    document.documentElement.classList.add('dark')
    const noIndex = state.kind === 'ok' && state.note.passwordRequired
    applyDocumentMeta({
      title:
        state.kind === 'ok'
          ? t('seo.pages.publishedNote.title', { title })
          : 'Note not found',
      description: t('seo.pages.publishedNote.description'),
      keywords: t('seo.keywords'),
      path: slug ? `/notes/${slug}` : '/notes',
      noIndex,
    })
    return () => {
      document.documentElement.classList.remove('dark')
    }
  }, [state, title, slug, t])

  const handleUnlock = () => {
    if (!slug) return
    setUnlockBusy(true)
    setPasswordError(null)
    void accessPublishedNote(slug, password)
      .then((note) => {
        setState({ kind: 'ok', note })
      })
      .catch((err: unknown) => {
        const status = err instanceof ApiError ? err.status : 500
        if (status === 401) {
          setPasswordError(t('seo.pages.publishedNote.passwordWrong'))
          return
        }
        setState({ kind: 'error', status })
      })
      .finally(() => setUnlockBusy(false))
  }

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-100 flex flex-col font-sans">
        <main className="flex-1 flex flex-col py-16 sm:py-24">
          <div className="w-full max-w-2xl mx-auto px-6 sm:px-8">
            <div className="h-10 w-48 rounded-md bg-white/5 animate-pulse" />
          </div>
        </main>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-100 flex flex-col font-sans selection:bg-white/20 selection:text-white relative">
        <main className="flex-1 flex flex-col py-16 sm:py-24 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none" />
          <div className="w-full max-w-2xl mx-auto px-6 sm:px-8 relative z-10 text-center">
            <h1 className="text-2xl font-bold text-white mb-3">
              {state.status === 404 ? 'Note not found' : 'Could not load note'}
            </h1>
            <p className="text-zinc-400 text-sm mb-8">
              {state.status === 404
                ? 'This link may be expired or the note was made private.'
                : 'Try again later.'}
            </p>
            <Link
              to="/"
              className="inline-flex text-sm text-zinc-300 underline underline-offset-4 hover:text-white"
            >
              {t('seo.goHome')}
            </Link>
          </div>
        </main>
        <MadeWithBadge />
      </div>
    )
  }

  if (state.note.passwordRequired) {
    return (
      <div className="min-h-screen bg-[#050505] text-zinc-100 flex flex-col font-sans relative">
        <main className="flex-1 flex flex-col py-16 sm:py-24 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none" />
          <PasswordGate
            title={t('seo.pages.publishedNote.passwordTitle')}
            password={password}
            error={passwordError}
            busy={unlockBusy}
            onPasswordChange={setPassword}
            onSubmit={handleUnlock}
          />
        </main>
        <MadeWithBadge />
      </div>
    )
  }

  const displayTitle = publishedNoteDisplayTitle(state.note.title)

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 flex flex-col font-sans selection:bg-white/20 selection:text-white relative">
      <main className="flex-1 flex flex-col py-16 sm:py-24 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-[500px] bg-cyan-500/5 blur-[120px] rounded-full pointer-events-none" />
        <div className="w-full max-w-2xl mx-auto px-6 sm:px-8 relative z-10">
          <article>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white break-words mb-8 sm:mb-12">
              {displayTitle}
            </h1>
            <NoteBody bodyMd={state.note.bodyMd} />
          </article>
        </div>
      </main>
      <MadeWithBadge />
    </div>
  )
}

function MadeWithBadge() {
  const { t } = useI18n()
  return (
    <Link
      to="/"
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 flex items-center gap-2 px-2 py-2 rounded-md border border-white/10 bg-black backdrop-blur-md shadow-2xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/10 hover:shadow-white/5 transition-all z-50 group"
    >
      <img
        src="/favicon.svg"
        alt=""
        className="w-4 h-4 rounded-sm opacity-80 group-hover:opacity-100 transition-opacity"
        draggable={false}
      />
      <span>{t('seo.madeWith')}</span>
    </Link>
  )
}
