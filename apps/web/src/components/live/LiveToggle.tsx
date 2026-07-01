import { cn } from '@/lib/cn'

type Props = {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  className?: string
}

/** Pill toggle — matches live room bottom bar controls. */
export function LiveToggle({ checked, onChange, label, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex items-center gap-2.5 rounded-lg border px-3 py-1.5 transition-colors',
        checked
          ? 'border-border-strong bg-surface-2 text-text-primary'
          : 'border-border bg-surface-2 text-text-secondary hover:text-text-primary',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative inline-flex h-[18px] w-[30px] shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-text-primary' : 'bg-border-strong',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-surface-1 shadow-sm transition-transform duration-200 ease-out',
            checked && 'translate-x-3',
          )}
        />
      </span>
      <span className="text-[13px] font-medium">{label}</span>
    </button>
  )
}
