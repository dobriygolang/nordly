import { Link } from 'react-router-dom'
import { Code2, Moon, Settings, Sun, UserPlus, X } from 'lucide-react'
import { RoomSessionTimer } from '@/components/live/RoomSessionTimer'
import { brand } from '@/lib/brand/tokens'
import type { LiveRoomTheme } from '@/lib/live/roomTheme'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'

type Props = {
  closeTo: string
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
  onDisplayNameSave: () => void
  theme: LiveRoomTheme
  onThemeToggle: () => void
}

export function LiveRoomTopBar({
  closeTo,
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
  onDisplayNameSave,
  theme,
  onThemeToggle,
}: Props) {
  const { t } = useI18n()

  return (
    <header
      className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b bg-surface-1 px-4 sm:px-5"
      style={{ borderColor: brand.hair }}
    >
      <div className="flex min-w-0 items-center gap-4">
        <Link to={closeTo} className="inline-flex items-center gap-2 no-underline">
          <Code2 className="h-[18px] w-[18px] text-text-primary" strokeWidth={2} />
          <span className="text-[15px] font-medium tracking-[-0.01em] text-text-primary">
            {t('live.brand')}
          </span>
        </Link>

        <div className="hidden items-center gap-2 sm:flex">
          <TopBarButton
            variant="outline"
            icon={<X className="h-3.5 w-3.5" />}
            loading={closeLoading}
            onClick={onClose}
          >
            {t('live.closeRoom')}
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
            className="absolute right-0 top-[calc(100%+6px)] z-30 w-[240px] rounded-xl border border-border bg-surface-1 p-3 shadow-lg"
            style={{ boxShadow: brand.cardShadow }}
          >
            <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-text-muted">
              {t('live.name')}
            </label>
            <input
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-text-primary outline-none focus:border-border-strong"
              placeholder={t('live.namePlaceholder')}
            />
            <button
              type="button"
              onClick={onDisplayNameSave}
              className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-1"
            >
              {t('live.saveName')}
            </button>

            <div className="my-3 h-px bg-border" />

            <button
              type="button"
              onClick={onThemeToggle}
              className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-2"
            >
              {theme === 'light' ? (
                <Moon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Sun className="h-3.5 w-3.5 shrink-0" />
              )}
              {theme === 'light' ? t('live.themeDark') : t('live.themeLight')}
            </button>

            {isOwner ? (
              <>
                <div className="my-3 h-px bg-border" />
                <MenuButton loading={inviteLoading} onClick={onInvite}>
                  {inviteCopied ? t('live.inviteCopiedMenu') : t('live.copyInvite')}
                </MenuButton>
              </>
            ) : null}
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
}: {
  variant: 'outline' | 'solid'
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      type="button"
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

function MenuButton({
  children,
  onClick,
  loading,
}: {
  children: React.ReactNode
  onClick: () => void
  loading?: boolean
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex w-full rounded-lg px-1 py-2 text-left text-[13px] text-text-primary transition-colors hover:bg-surface-2 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
