import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'

import { PublicSiteLayout } from '@/components/brand/PublicSiteLayout'
import { RouteDocumentMeta } from '@/lib/site/documentMeta'
import { RouteLoader } from '@/components/RouteLoader'
import { isLiveCodeHost } from '@/lib/site/brand'
import { isLiveRoomId } from '@/lib/live/liveRoomUrl'

const WelcomePage = lazy(() => import('@/pages/WelcomePage'))
const PublishedNotePage = lazy(() => import('@/pages/PublishedNotePage'))
const PublishedBoardPage = lazy(() => import('@/pages/PublishedBoardPage'))
const CollabRoomPage = lazy(() => import('@/pages/CollabRoomPage'))
const LiveNewPage = lazy(() =>
  import('@/pages/LiveNewPage').then((m) => ({ default: m.LiveNewPage })),
)
const LegalTermsPage = lazy(() => import('@/pages/LegalTermsPage'))
const LegalPrivacyPage = lazy(() => import('@/pages/LegalPrivacyPage'))
const NordlyDownloadPage = lazy(() => import('@/pages/NordlyDownloadPage'))
const OAuthBridgePage = lazy(() => import('@/pages/OAuthBridgePage'))

function RetiredRedirect() {
  return <Navigate to="/" replace />
}

const RETIRED_PATHS = [
  '/login',
  '/auth/callback',
  '/profile',
  '/settings',
  '/checkout',
  '/checkout/:planSlug',
  '/billing/welcome',
  '/pricing',
  '/today',
  '/dashboard',
  '/learn/*',
  '/mock/*',
  '/interview/*',
  '/tasks',
  '/admin/*',
] as const

function LegacyNoteSlugRedirect() {
  const { slug } = useParams<{ slug: string }>()
  return <Navigate to={`/notes/${slug ?? ''}`} replace />
}

function HomeRoute() {
  if (isLiveCodeHost()) {
    return <LiveNewPage />
  }
  return <WelcomePage />
}

/** Short share path on code.trynordly.app — `/{uuid}` (also accepted on any host). */
function ShortLiveRoomRoute() {
  const { roomId } = useParams<{ roomId: string }>()
  if (!isLiveRoomId(roomId)) {
    return <Navigate to="/" replace />
  }
  return <CollabRoomPage />
}

export function AnimatedRoutes() {
  return (
    <>
      <RouteDocumentMeta />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/welcome" element={<Navigate to="/" replace />} />

          <Route element={<PublicSiteLayout />}>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/live/new" element={<LiveNewPage />} />
            <Route path="/legal/terms" element={<LegalTermsPage />} />
            <Route path="/legal/privacy" element={<LegalPrivacyPage />} />
            <Route path="/download" element={<NordlyDownloadPage />} />
          </Route>
          <Route
            path="/oauth/google-calendar"
            element={<OAuthBridgePage provider="google_calendar" />}
          />
          <Route path="/oauth/zoom" element={<OAuthBridgePage provider="zoom" />} />
          <Route path="/notes/:slug" element={<PublishedNotePage />} />
          <Route path="/board/:slug" element={<PublishedBoardPage />} />
          <Route path="/n/:slug" element={<LegacyNoteSlugRedirect />} />
          <Route path="/live/:roomId" element={<CollabRoomPage />} />

          {RETIRED_PATHS.map((path) => (
            <Route key={path} path={path} element={<RetiredRedirect />} />
          ))}

          <Route path="/:roomId" element={<ShortLiveRoomRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
