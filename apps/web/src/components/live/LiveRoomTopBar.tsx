import { Code2, CodeXml, Moon, PenLine, Settings, Sun, UserPlus, X } from 'lucide-react'
import { RoomSessionTimer } from '@/components/live/RoomSessionTimer'
import { brand } from '@/lib/brand/tokens'
import type { LiveRoomTheme } from '@/lib/live/roomTheme'
import { marketingHomeHref } from '@/lib/site/brand'
import { themeToggleOrigin, type ThemeToggleOrigin } from '@/lib/site/themeTransition'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'

type Props = {
  onClose: () => void
  closeLoading?: boolean
  isOwner: boolean
  inviteLoading: boolean
  inviteCopied: boolean
  onInvite: () => void
  wsFailed: boolean
  onReconnect: () => void
  timerMode?: 'countdown' | 'elapsed'
  createdAt?: string
  expiresAt?: string
  onTimerExpired?: () => void
  displayName: string
  onDisplayNameChange: (name: string) => void
  theme: LiveRoomTheme
  onThemeToggle: (origin?: ThemeToggleOrigin) => void
  surface?: 'code' | 'board'
  onSurfaceToggle?: (origin?: ThemeToggleOrigin) => void
}

export function LiveRoomTopBar({
  onClose,
  closeLoading,
  isOwner,
  inviteLoading,
  inviteCopied,
  onInvite,
  wsFailed,
  onReconnect,
  timerMode,
  createdAt,
  expiresAt,
  onTimerExpired,
  displayName,
  onDisplayNameChange,
  theme,
  onThemeToggle,
  surface = 'code',
  onSurfaceToggle,
}: Props) {
  const { t } = useI18n()

  return (
    <header
      className="safe-x safe-top flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b bg-surface-1 py-2 sm:gap-4 sm:py-0"
      style={{ borderColor: brand.hair }}
    >
      <div className="flex min-w-0 items-center gap-4">
        <a href={marketingHomeHref()} className="inline-flex items-center gap-2 no-underline">
          <Code2 className="h-[18px] w-[18px] text-text-primary" strokeWidth={2} />
          <span className="text-[15px] font-medium tracking-[-0.01em] text-text-primary">
            {t('live.brand')}
          </span>
        </a>

        <div className="flex items-center gap-2">
          {onSurfaceToggle ? (
            <TopBarButton
              variant="outline"
              icon={
                surface === 'board' ? (
                  <CodeXml className="h-3.5 w-3.5" />
                ) : (
                  <PenLine className="h-3.5 w-3.5" />
                )
              }
              onClick={(event) => onSurfaceToggle(themeToggleOrigin(event))}
              ariaLabel={surface === 'board' ? t('live.openCode') : t('live.openBoard')}
            >
              <span className="hidden sm:inline">
                {surface === 'board' ? t('live.openCode') : t('live.openBoard')}
              </span>
            </TopBarButton>
          ) : null}
          <TopBarButton
            variant="outline"
            icon={<X className="h-3.5 w-3.5" />}
            loading={closeLoading}
            onClick={onClose}
            ariaLabel={t('live.closeRoom')}
          >
            <span className="hidden sm:inline">{t('live.closeRoom')}</span>
          </TopBarButton>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {timerMode ? (
          <RoomSessionTimer
            mode={timerMode}
            createdAt={createdAt}
            expiresAt={expiresAt}
            onExpired={onTimerExpired}
          />
        ) : null}

        {wsFailed ? (
          <button
            type="button"
            onClick={onReconnect}
            className="text-[13px] text-text-secondary underline hover:text-text-primary"
          >
            {t('live.reconnect')}
          </button>
        ) : null}

        {isOwner ? (
          <button
            type="button"
            disabled={inviteLoading}
            onClick={onInvite}
            title={t('live.inviteTitle')}
            aria-label={inviteCopied ? t('live.inviteCopied') : t('live.invite')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50',
              inviteCopied
                ? 'border-border-strong bg-surface-2 text-text-primary'
                : 'border-border bg-surface-1 text-text-primary hover:bg-surface-2',
            )}
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {inviteCopied ? t('live.inviteCopied') : t('live.invite')}
            </span>
          </button>
        ) : null}

        <details className="relative">
          <summary
            aria-label={t('live.settings')}
            className={cn(
              'flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-1.5',
              'text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-2',
              '[&::-webkit-details-marker]:hidden',
            )}
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('live.settings')}</span>
          </summary>
          <div
            className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-[min(70dvh,24rem)] w-[min(240px,calc(100vw-2rem))] overflow-auto rounded-xl border border-border bg-surface-1 p-3 shadow-lg"
            style={{ boxShadow: brand.cardShadow }}
          >
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
              {t('live.name')}
            </label>
            <input
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-base text-text-primary outline-none focus:border-border-strong sm:text-[13px]"
              placeholder={t('live.namePlaceholder')}
            />

            <div className="my-3 h-px bg-border" />

            <button
              type="button"
              onClick={(event) => onThemeToggle(themeToggleOrigin(event))}
              className="flex w-full items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-1"
            >
              {theme === 'light' ? (
                <Moon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Sun className="h-3.5 w-3.5 shrink-0" />
              )}
              {theme === 'light' ? t('live.themeDark') : t('live.themeLight')}
            </button>
          </div>
        </details>
      </div>
    </header>
  )
}

function TopBarButton({
  variant,
  icon,
  children,
  onClick,
  loading,
  ariaLabel,
}: {
  variant: 'outline' | 'solid'
  icon: React.ReactNode
  children?: React.ReactNode
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
  loading?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={loading}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50',
        variant === 'outline'
          ? 'border border-border-strong bg-surface-1 text-text-primary hover:bg-surface-2'
          : 'border border-text-primary bg-text-primary text-bg hover:bg-text-primary/90',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

