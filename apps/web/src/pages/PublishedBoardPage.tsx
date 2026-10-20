import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  ApiError,
  fetchPublishedBoard,
  publishedBoardDisplayTitle,
  type PublishedBoard,
} from '@/lib/api/publicBoards'
import { applyDocumentMeta } from '@/lib/site/documentMeta'
import { useI18n } from '@/lib/i18n'

const PublishedBoardCanvas = lazy(() =>
  import('./PublishedBoardCanvas').then((m) => ({ default: m.PublishedBoardCanvas })),
)

function parseScene(raw: string): { elements: unknown[]; files: Record<string, unknown> } {
  if (!raw.trim()) {
    return { elements: [], files: {} }
  }
  const j = JSON.parse(raw) as { elements?: unknown[]; files?: Record<string, unknown> }
  if (!Array.isArray(j.elements) || !j.files || typeof j.files !== 'object' || Array.isArray(j.files)) {
    throw new Error('Published board scene has an invalid shape')
  }
  return { elements: j.elements, files: j.files }
}

export default function PublishedBoardPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { t } = useI18n()
  const [state, setState] = useState<
    | { kind: 'loading' }
    | {
        kind: 'ok'
        board: PublishedBoard
        scene: { elements: unknown[]; files: Record<string, unknown> }
      }
    | { kind: 'error'; status: number }
  >({ kind: 'loading' })

  useEffect(() => {
    if (!slug) {
      setState({ kind: 'error', status: 404 })
      return
    }
    let live = true
    setState({ kind: 'loading' })
    void fetchPublishedBoard(slug)
      .then((board) => {
        const scene = parseScene(board.sceneJson)
        if (live) setState({ kind: 'ok', board, scene })
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
    state.kind === 'ok' ? publishedBoardDisplayTitle(state.board.title) : 'Board not found'

  useEffect(() => {
    document.documentElement.classList.add('dark')
    applyDocumentMeta({
      title:
        state.kind === 'ok'
          ? t('seo.pages.publishedBoard.title', { title })
          : 'Board not found',
      description: t('seo.pages.publishedBoard.description'),
      keywords: t('seo.keywords'),
      path: slug ? `/board/${slug}` : '/board',
    })
    return () => {
      document.documentElement.classList.remove('dark')
    }
  }, [state.kind, title, slug, t])

  const scene = useMemo(() => (state.kind === 'ok' ? state.scene : null), [state])

  if (state.kind === 'loading') {
    return (
      <div className="min-h-dvh bg-[#050505] text-zinc-100 flex items-center justify-center">
        <div className="h-10 w-48 rounded-md bg-white/5 animate-pulse" />
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="min-h-dvh bg-[#050505] text-zinc-100 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold mb-3">
          {state.status === 404 ? 'Board not found' : 'Could not load the board'}
        </h1>
        <Link to="/" className="text-sm text-zinc-300 underline underline-offset-4">
          {t('seo.goHome')}
        </Link>
      </div>
    )
  }
  if (state.kind !== 'ok' || !scene) {
    return (
      <div className="min-h-dvh bg-[#050505] text-zinc-100 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-2xl font-bold mb-3">Could not load the board</h1>
        <Link to="/" className="text-sm text-zinc-300 underline underline-offset-4">
          {t('seo.goHome')}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#050505] text-zinc-100">
      <header className="safe-x safe-top border-b border-white/10 py-4">
        <h1 className="text-lg font-semibold truncate">{title}</h1>
      </header>
      <Suspense fallback={<div className="flex-1 min-h-0 bg-[#050505]" />}>
        <PublishedBoardCanvas scene={scene} />
      </Suspense>
      <Link
        to="/"
        className="safe-floating fixed z-50 flex items-center gap-2 rounded-md border border-white/10 bg-black px-2 py-2 text-xs text-zinc-400 hover:text-white"
      >
        {t('seo.madeWith')}
      </Link>
    </div>
  )
}
