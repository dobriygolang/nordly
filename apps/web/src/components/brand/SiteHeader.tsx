import type { ReactNode } from 'react'
import { Logo } from '@/components/brand/Logo'
import { SiteThemeToggle } from '@/components/brand/SiteThemeToggle'
import { LandingDownloadButton } from '@/components/landing/LandingDownloadButton'
import { cn } from '@/lib/cn'
import { useSiteTheme } from '@/lib/site/useSiteTheme'

type SiteHeaderProps = {
  right?: ReactNode
  className?: string
}

export function SiteHeader({ right, className }: SiteHeaderProps) {
  const { theme, toggleTheme } = useSiteTheme()

  const defaultRight = (
    <>
      <SiteThemeToggle theme={theme} onToggle={toggleTheme} compact className="hidden sm:inline-flex" />
      <LandingDownloadButton compact />
    </>
  )

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b border-site-border/60 bg-site-bg/80 backdrop-blur-md',
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Logo to="/" />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <SiteThemeToggle theme={theme} onToggle={toggleTheme} compact className="sm:hidden" />
          {right ?? defaultRight}
        </div>
      </div>
    </header>
  )
}
