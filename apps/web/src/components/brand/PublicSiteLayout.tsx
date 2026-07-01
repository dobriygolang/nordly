import { Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'

import { RouteLoader } from '@/components/RouteLoader'
import { SiteHeader } from '@/components/brand/SiteHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { usePageTransition } from '@/lib/motion-presets'
import { SiteThemeShell, useSiteTheme } from '@/lib/site/useSiteTheme'

/** Shared marketing shell — fixed header/footer, crossfading main content. */
export function PublicSiteLayout() {
  const { theme } = useSiteTheme()
  const location = useLocation()
  const pageMotion = usePageTransition()

  return (
    <SiteThemeShell
      theme={theme}
      className="flex min-h-screen flex-col bg-site-bg font-sans text-site-text selection:bg-site-accent/20 selection:text-site-text"
    >
      <SiteHeader />
      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false}>
          <motion.div
            key={location.pathname}
            className="absolute inset-0 flex flex-col overflow-y-auto overflow-x-hidden"
            {...pageMotion}
          >
            <Suspense fallback={<RouteLoader />}>
              <Outlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
      <LandingFooter />
    </SiteThemeShell>
  )
}
