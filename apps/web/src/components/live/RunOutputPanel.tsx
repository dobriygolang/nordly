import { Play } from 'lucide-react'
import type { CodeRun } from '@/lib/types'
import { cn } from '@/lib/cn'
import { useI18n } from '@/lib/i18n'

type Props = {
  tab: 'stdout' | 'stderr'
  onTabChange: (tab: 'stdout' | 'stderr') => void
  run?: CodeRun
  running: boolean
  error?: string | null
  triggeredBy?: string | null
  canRun?: boolean
  onRun?: () => void
}

function isRunnerError(status: string): boolean {
  if (!status) return false
  const s = status.toLowerCase()
  return s.includes('failed') || s.includes('error') || s === 'internal_error'
}

function panelBody({
  tab,
  run,
  running,
  error,
}: Pick<Props, 'tab' | 'run' | 'running' | 'error'>): string {
  if (error) return error
  if (running && !run) return '…'
  if (!run) return ''
  if (tab === 'stdout') {
    const out = run.stdout?.trim()
    if (out) return out
    if (run.tests_total > 0) {
      return `tests: ${run.tests_passed}/${run.tests_total}`
    }
    return '(no stdout)'
  }
  const err =
    run.stderr?.trim() ||
    run.compile_output?.trim() ||
    run.error?.trim() ||
    ''
  return err || '(no stderr)'
}

export function RunOutputPanel({
  tab,
  onTabChange,
  run,
  running,
  error,
  triggeredBy,
  canRun,
  onRun,
}: Props) {
  const { t } = useI18n()

  const statusLabel = run
    ? isRunnerError(run.status)
      ? `RUNNER · ${run.status.toUpperCase()}`
      : run.exit_code != null && run.time_ms != null
        ? `EXIT ${run.exit_code} · ${run.time_ms}ms`
        : run.status.toUpperCase()
    : null

  return (
    <aside
      className={cn(
        'flex h-full w-[min(420px,38%)] min-w-[280px] shrink-0 flex-col',
        'border-l border-border bg-surface-1 font-mono text-text-primary',
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {canRun ? (
            <button
              type="button"
              onClick={onRun}
              disabled={running}
              title="Run (⌘↵)"
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-text-primary',
                'bg-text-primary px-2.5 py-1.5 text-[12px] font-medium text-bg transition-opacity',
                'hover:opacity-90 disabled:opacity-50',
              )}
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {running ? t('live.running') : t('live.run')}
            </button>
          ) : null}
          {(['stdout', 'stderr'] as const).map((tabName) => (
            <button
              key={tabName}
              type="button"
              onClick={() => onTabChange(tabName)}
              className={cn(
                'border-none bg-transparent p-0 text-[10px] uppercase tracking-[0.08em] transition-colors',
                tab === tabName ? 'font-medium text-text-primary' : 'font-medium text-text-muted',
              )}
            >
              {tabName}
            </button>
          ))}
        </div>
        {statusLabel ? (
          <span
            className={cn(
              'shrink-0 font-mono text-[10px] tracking-[0.08em]',
              run && isRunnerError(run.status) ? 'text-danger' : 'text-text-muted',
            )}
          >
            {statusLabel}
          </span>
        ) : null}
      </div>

      {triggeredBy ? (
        <p className="border-b border-border px-3 py-1.5 text-[11px] text-text-muted">
          {t('live.runBy', { name: triggeredBy })}
        </p>
      ) : null}

      <pre
        className={cn(
          'm-0 flex-1 overflow-auto px-3 py-3 text-xs whitespace-pre-wrap',
          tab === 'stderr' ? 'text-danger' : 'text-text-primary',
        )}
      >
        {panelBody({ tab, run, running, error }) || t('live.runHint')}
      </pre>
    </aside>
  )
}
