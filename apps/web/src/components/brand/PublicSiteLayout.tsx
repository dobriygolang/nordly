import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'

import { RouteLoader } from '@/components/RouteLoader'
import { SiteHeader } from '@/components/brand/SiteHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { LandingDownloadProvider } from '@/lib/landing/useLandingDownload'
import { SiteThemeShell, useSiteTheme } from '@/lib/site/useSiteTheme'

/** Shared marketing shell — fixed header/footer, main content in normal document flow. */
export function PublicSiteLayout() {
  const { theme } = useSiteTheme()

  return (
    <LandingDownloadProvider>
      <SiteThemeShell
        theme={theme}
        className="flex min-h-screen flex-col bg-site-bg font-sans text-site-text selection:bg-site-accent/20 selection:text-site-text"
      >
        <SiteHeader />
        <main className="flex flex-1 flex-col">
          <Suspense fallback={<RouteLoader />}>
            <Outlet />
          </Suspense>
        </main>
        <LandingFooter />
      </SiteThemeShell>
    </LandingDownloadProvider>
  )
}
