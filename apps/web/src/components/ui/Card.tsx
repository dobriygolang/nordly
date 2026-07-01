import clsx from 'clsx'
import { forwardRef, type HTMLAttributes } from 'react'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'article' | 'section' | 'button'
  type?: 'button' | 'submit' | 'reset'
}

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as: Tag = 'div', type, className, ...props },
  ref,
) {
  return (
    <Tag
      ref={ref as never}
      type={Tag === 'button' ? (type ?? 'button') : undefined}
      className={clsx(
        'rounded-xl border text-left',
        Tag === 'button' && 'cursor-pointer appearance-none font-inherit',
        'bg-surface-2 border-border p-5',
        className,
      )}
      {...props}
    />
  )
})
