import { LandingDownloadButton } from '@/components/landing/LandingDownloadButton'
import { cn } from '@/lib/cn'
import { publicLiveNewUrl } from '@/lib/live/liveRoomUrl'
import { useI18n } from '@/lib/i18n'
import { useSiteTheme } from '@/lib/site/useSiteTheme'

export function LandingHero() {
  const { t } = useI18n()
  const { theme } = useSiteTheme()
  const isDark = theme === 'dark'

  return (
    <section className="relative overflow-hidden pb-16 pt-14 md:pb-32 md:pt-32">
      <div className="pointer-events-none absolute right-0 top-0 z-0 h-full w-full opacity-20">
        <div
          className={cn(
            'absolute right-[-10%] top-[10%] h-[800px] w-[800px] rounded-full blur-[150px]',
            isDark ? 'bg-white opacity-5' : 'bg-site-glow opacity-[0.08]',
          )}
          style={isDark ? undefined : { backgroundColor: 'rgb(var(--site-glow))' }}
        />
      </div>

      <div className="safe-x relative z-10 mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <div className="mb-8 inline-flex animate-[fadeInUp_0.45s_ease-out_both] items-center gap-2 rounded-full border border-site-border bg-site-card px-3 py-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="font-mono text-xs text-site-muted">{t('welcome.pill')}</span>
          </div>

          <h1 className="mb-6 animate-[fadeInUp_0.45s_ease-out_0.04s_both] text-[2.5rem] font-bold leading-[1.05] tracking-tight text-site-text sm:text-5xl md:mb-8 md:text-7xl md:leading-[1.1]">
            {t('welcome.heroLine1')}{' '}
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(to right, rgb(var(--site-text)), rgb(var(--site-hero-gradient-to)))`,
              }}
            >
              {t('welcome.heroLine2')}
              <br />
              {t('welcome.heroLine3')}
            </span>
          </h1>

          <p className="mb-8 max-w-xl animate-[fadeInUp_0.45s_ease-out_0.08s_both] text-base leading-relaxed text-site-muted sm:text-lg md:mb-10 md:text-xl">
            {t('welcome.heroBody')}
          </p>

          <div className="flex animate-[fadeInUp_0.45s_ease-out_0.12s_both] flex-col gap-4 sm:flex-row sm:items-center">
            <LandingDownloadButton className="w-full sm:w-auto" />
            <a
              href={publicLiveNewUrl()}
              className="inline-flex w-full items-center justify-center rounded-md border border-site-border px-6 py-3 text-sm font-medium text-site-text no-underline transition-colors hover:bg-site-card sm:w-auto"
            >
              {t('welcome.heroLiveCta')}
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
