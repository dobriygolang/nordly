import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/brand/SiteHeader'
import { SiteThemeShell, useSiteTheme } from '@/lib/site/useSiteTheme'

type ShellProps = {
  children: ReactNode
}

/** Site-wide page shell: theme + shared header. */
export function PublicPageShell({ children }: ShellProps) {
  const { theme } = useSiteTheme()

  return (
    <SiteThemeShell
      theme={theme}
      className="min-h-screen bg-site-bg font-sans text-site-text selection:bg-site-accent/20 selection:text-site-text"
    >
      <SiteHeader />
      {children}
    </SiteThemeShell>
  )
}
