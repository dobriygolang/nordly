/** @deprecated Use PublicSiteLayout via router; kept for live guest gate and other full-bleed flows. */
export { PublicSiteLayout } from '@/components/brand/PublicSiteLayout'

import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/brand/SiteHeader'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { SiteThemeShell, useSiteTheme } from '@/lib/site/useSiteTheme'

type ShellProps = {
  children: ReactNode
}

/** Standalone shell when a route sits outside PublicSiteLayout (e.g. live guest join). */
export function PublicPageShell({ children }: ShellProps) {
  const { theme } = useSiteTheme()

  return (
    <SiteThemeShell
      theme={theme}
      className="flex min-h-screen flex-col bg-site-bg font-sans text-site-text selection:bg-site-accent/20 selection:text-site-text"
    >
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <LandingFooter />
    </SiteThemeShell>
  )
}
