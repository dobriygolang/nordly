import { Suspense } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'

import { RouteLoader } from '@/components/RouteLoader'
import { SiteHeader } from '@/components/brand/SiteHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { usePageTransition } from '@/lib/motion-presets'
import { SiteThemeShell, useSiteTheme } from '@/lib/site/useSiteTheme'

/** Shared marketing shell — fixed header/footer, animated main content in normal document flow. */
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
      <AnimatePresence mode="wait" initial={false}>
        <motion.main
          key={location.pathname}
          className="flex flex-1 flex-col"
          {...pageMotion}
        >
          <Suspense fallback={<RouteLoader />}>
            <Outlet />
          </Suspense>
        </motion.main>
      </AnimatePresence>
      <LandingFooter />
    </SiteThemeShell>
  )
}
