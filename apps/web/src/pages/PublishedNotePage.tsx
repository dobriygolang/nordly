import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  ApiError,
  accessPublishedNote,
  fetchPublishedNote,
  publishedNoteDisplayTitle,
  type PublishedNote,
} from '@/lib/api/publicNotes'
import { publishedNoteDocument, type PublishedNoteHeading } from '@/lib/markdown/publishedNoteDocument'
import { Logo } from '@/components/brand/Logo'
import { Check, ChevronDown, Link2, LockKeyhole } from 'lucide-react'
import { SiteThemeToggle } from '@/components/brand/SiteThemeToggle'
import { runThemeTransition } from '@/lib/site/themeTransition'
import { applyDocumentMeta } from '@/lib/site/documentMeta'
import { useI18n } from '@/lib/i18n'

function Contents({ headings, activeId, onNavigate }: {
  headings: PublishedNoteHeading[]
  activeId: string
  onNavigate?: () => void
}) {
  const { t } = useI18n()
  const baseLevel = Math.min(...headings.map((heading) => heading.level))
  return (
    <nav aria-label={t('seo.pages.publishedNote.contents')} className="published-note__contents">
      {headings.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          aria-current={activeId === heading.id ? 'location' : undefined}
          style={{ paddingLeft: `${12 + Math.max(0, heading.level - baseLevel) * 12}px` }}
          onClick={onNavigate}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  )
}

function NoteReader({ note }: { note: PublishedNote }) {
  const { t } = useI18n()
  const { html, headings, readingMinutes } = useMemo(() => publishedNoteDocument(note.bodyMd), [note.bodyMd])
  const bodyRef = useRef<HTMLDivElement>(null)
  const mobileContentsRef = useRef<HTMLDetailsElement>(null)
  const [activeId, setActiveId] = useState(headings[0]?.id ?? '')
  const hasContents = headings.length > 1

  useEffect(() => {
    const elements = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]') ?? [])
    let frame = 0
    const update = () => {
      frame = 0
      let current = elements[0]?.id ?? ''
      for (const heading of elements) {
        if (heading.getBoundingClientRect().top > 150) break
        current = heading.id
      }
      setActiveId(current)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    const linkedHeading = elements.find((heading) => `#${heading.id}` === window.location.hash)
    linkedHeading?.scrollIntoView()
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [html])

  return (
    <main id="note-content" className="published-note__layout" data-contents={hasContents}>
      <article className="published-note__article">
        <header className="published-note__title-block">
          <p className="published-note__eyebrow">{t('seo.pages.publishedNote.sharedNote')}</p>
          <h1>{publishedNoteDisplayTitle(note.title)}</h1>
          <div className="published-note__meta">
            <span>{t('seo.pages.publishedNote.readOnly')}</span>
            {note.bodyMd.trim() ? <>
              <span aria-hidden="true">·</span>
              <span>{t('seo.pages.publishedNote.readingTime', { minutes: readingMinutes })}</span>
            </> : null}
          </div>
        </header>
        {hasContents ? (
          <details ref={mobileContentsRef} className="published-note__mobile-contents">
            <summary>{t('seo.pages.publishedNote.contents')}<ChevronDown size={16} aria-hidden="true" /></summary>
            <Contents headings={headings} activeId={activeId} onNavigate={() => { if (mobileContentsRef.current) mobileContentsRef.current.open = false }} />
          </details>
        ) : null}
        <div
          ref={bodyRef}
          className="nordly-published-md"
          // The existing renderer escapes source text and rejects unsafe links / raw HTML.
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {!note.bodyMd.trim() ? <p className="published-note__empty">{t('seo.pages.publishedNote.empty')}</p> : null}
        <footer className="published-note__footer">
          <img src="/favicon.svg" alt="" width={18} height={18} />
          <Link to="/">{t('seo.madeWith')}</Link>
          <a href="#note-content">{t('seo.pages.publishedNote.backToTop')} ↑</a>
        </footer>
      </article>
      {hasContents ? (
        <aside className="published-note__aside">
          <div className="published-note__aside-inner">
            <p className="published-note__eyebrow">{t('seo.pages.publishedNote.contents')}</p>
            <Contents headings={headings} activeId={activeId} />
          </div>
        </aside>
      ) : null}
    </main>
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
    <div className="published-note__gate">
      <LockKeyhole size={24} aria-hidden="true" />
      <h1 className="published-note__state-title">{title}</h1>
      <p className="published-note__state-hint">{t('seo.pages.publishedNote.passwordHint')}</p>
      <form
        className="published-note__password-form"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <input
          type="password"
          disabled={busy}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder={t('seo.pages.publishedNote.passwordPlaceholder')}
          aria-label={t('seo.pages.publishedNote.passwordPlaceholder')}
          className="published-note__password"
          autoComplete="current-password"
        />
        {error ? <p className="published-note__error" role="alert">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || password.trim().length === 0}
          className="published-note__submit"
        >
          {t(busy ? 'seo.pages.publishedNote.passwordOpening' : 'seo.pages.publishedNote.passwordSubmit')}
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
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')

  useEffect(() => {
    if (!slug) {
      setState({ kind: 'error', status: 404 })
      return
    }
    let live = true
    setState({ kind: 'loading' })
    setPassword('')
    setPasswordError(null)
    setCopyState('idle')
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
    state.kind === 'ok' ? publishedNoteDisplayTitle(state.note.title)
      : t(state.kind === 'loading' ? 'seo.pages.publishedNote.loading'
        : state.status === 404 ? 'seo.pages.publishedNote.notFound' : 'seo.pages.publishedNote.loadError')

  useEffect(() => {
    document.documentElement.classList.add('dark')
    const noIndex = state.kind === 'ok' && state.note.passwordRequired
    applyDocumentMeta({
      title:
        state.kind === 'ok'
          ? t('seo.pages.publishedNote.title', { title })
          : title,
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
    if (!slug || unlockBusy) return
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

  const copyLink = async () => {
    try {
      const url = new URL(window.location.href)
      url.hash = ''
      await navigator.clipboard.writeText(url.href)
      setCopyState('copied')
    } catch (error) {
      console.warn('[nordly:published-note] copy link failed', error)
      setCopyState('error')
    }
  }

  return (
    <div className="published-note" data-theme={theme} data-site-theme={theme}>
      <a className="published-note__skip" href="#note-content">{t('seo.pages.publishedNote.skipToNote')}</a>
      <header className="published-note__bar">
        <Logo size="sm" />
        <div className="published-note__actions">
          {state.kind === 'ok' && !state.note.passwordRequired ? (
            <button type="button" className="published-note__copy" onClick={() => void copyLink()}>
              {copyState === 'copied' ? <Check size={15} aria-hidden="true" /> : <Link2 size={15} aria-hidden="true" />}
              {t(copyState === 'copied' ? 'seo.pages.publishedNote.copied' : 'seo.pages.publishedNote.copyLink')}
            </button>
          ) : null}
          <SiteThemeToggle
            theme={theme}
            compact
            onToggle={(origin) => runThemeTransition(() => setTheme((current) => current === 'dark' ? 'light' : 'dark'), origin)}
          />
        </div>
      </header>
      <div className="published-note__copy-status" role="status">
        {copyState === 'error' ? t('seo.pages.publishedNote.copyError') : null}
      </div>
      {state.kind === 'loading' ? (
        <main id="note-content" className="published-note__state" aria-busy="true" aria-label={t('seo.pages.publishedNote.loading')}>
          <div className="published-note__skeleton" /><div className="published-note__skeleton published-note__skeleton--line" />
        </main>
      ) : state.kind === 'error' ? (
        <main id="note-content" className="published-note__state">
          <p className="published-note__eyebrow">{t('seo.pages.publishedNote.sharedNote')}</p>
          <h1 className="published-note__state-title">{t(state.status === 404 ? 'seo.pages.publishedNote.notFound' : 'seo.pages.publishedNote.loadError')}</h1>
          <p className="published-note__state-hint">{t(state.status === 404 ? 'seo.pages.publishedNote.notFoundHint' : 'seo.pages.publishedNote.loadErrorHint')}</p>
          <Link to="/" className="published-note__home">{t('seo.goHome')} ↗</Link>
        </main>
      ) : state.note.passwordRequired ? (
        <main id="note-content" className="published-note__state">
          <PasswordGate
            title={t('seo.pages.publishedNote.passwordTitle')}
            password={password}
            error={passwordError}
            busy={unlockBusy}
            onPasswordChange={setPassword}
            onSubmit={handleUnlock}
          />
        </main>
      ) : <NoteReader key={slug} note={state.note} />}
    </div>
  )
}
