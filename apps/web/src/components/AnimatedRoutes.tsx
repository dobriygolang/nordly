import { lazy, Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { RouteDocumentMeta } from '@/lib/site/documentMeta'
import { usePageTransition } from '@/lib/motion-presets'
import { RouteLoader } from '@/components/RouteLoader'

const WelcomePage = lazy(() => import('@/pages/WelcomePage'))
const PublishedNotePage = lazy(() => import('@/pages/PublishedNotePage'))
const PublishedBoardPage = lazy(() => import('@/pages/PublishedBoardPage'))
const CollabRoomPage = lazy(() => import('@/pages/CollabRoomPage'))
const LiveNewPage = lazy(() =>
  import('@/components/live/LiveNewPage').then((m) => ({ default: m.LiveNewPage })),
)
const PricingPage = lazy(() => import('@/pages/PricingPage'))
const LegalTermsPage = lazy(() => import('@/pages/LegalTermsPage'))
const LegalPrivacyPage = lazy(() => import('@/pages/LegalPrivacyPage'))
const NordlyDownloadPage = lazy(() => import('@/pages/NordlyDownloadPage'))

function RetiredRedirect() {
  return <Navigate to="/welcome" replace />
}

function LegacyNoteSlugRedirect() {
  const { slug } = useParams<{ slug: string }>()
  return <Navigate to={`/notes/${slug ?? ''}`} replace />
}

export function AnimatedRoutes() {
  const location = useLocation()
  const pageMotion = usePageTransition()

  return (
    <>
      <RouteDocumentMeta />
      <AnimatePresence mode="wait">
        <motion.div key={location.pathname} className="min-h-screen" {...pageMotion}>
          <Suspense fallback={<RouteLoader />}>
            <Routes location={location}>
              <Route path="/" element={<Navigate to="/welcome" replace />} />
              <Route path="/welcome" element={<WelcomePage />} />
              <Route path="/download" element={<NordlyDownloadPage />} />
              <Route path="/notes/:slug" element={<PublishedNotePage />} />
              <Route path="/board/:slug" element={<PublishedBoardPage />} />
              <Route path="/n/:slug" element={<LegacyNoteSlugRedirect />} />
              <Route path="/live/new" element={<LiveNewPage />} />
              <Route path="/live/:roomId" element={<CollabRoomPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/legal/terms" element={<LegalTermsPage />} />
              <Route path="/legal/privacy" element={<LegalPrivacyPage />} />

              <Route path="/login" element={<RetiredRedirect />} />
              <Route path="/auth/callback" element={<RetiredRedirect />} />
              <Route path="/profile" element={<RetiredRedirect />} />
              <Route path="/settings" element={<RetiredRedirect />} />
              <Route path="/checkout" element={<Navigate to="/pricing" replace />} />
              <Route path="/checkout/:planSlug" element={<Navigate to="/pricing" replace />} />
              <Route path="/billing/welcome" element={<Navigate to="/pricing" replace />} />

              <Route path="/today" element={<RetiredRedirect />} />
              <Route path="/dashboard" element={<RetiredRedirect />} />
              <Route path="/learn/*" element={<RetiredRedirect />} />
              <Route path="/mock/*" element={<RetiredRedirect />} />
              <Route path="/interview/*" element={<RetiredRedirect />} />
              <Route path="/tasks" element={<RetiredRedirect />} />
              <Route path="/admin/*" element={<RetiredRedirect />} />

              <Route path="*" element={<Navigate to="/welcome" replace />} />
            </Routes>
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </>
  )
}
