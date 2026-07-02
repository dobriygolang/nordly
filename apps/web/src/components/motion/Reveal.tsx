import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

import { revealContainerVariants, revealItemVariants } from '@/lib/motion-presets'

type RevealTag = 'div' | 'section' | 'header'

const motionHosts = {
  div: motion.div,
  section: motion.section,
  header: motion.header,
} as const

const staticHosts = {
  div: 'div',
  section: 'section',
  header: 'header',
} as const

type RevealProps = {
  children?: ReactNode
  className?: string
  /** Render as a different host element (e.g. `section`, `header`). Defaults to `div`. */
  as?: RevealTag
}

/**
 * Staggered entrance container. `RevealItem` descendants fade + rise in
 * sequence, matching the landing hero `fadeInUp` cascade. Falls back to a
 * static element when the user prefers reduced motion.
 */
export function Reveal({ children, className, as = 'div' }: RevealProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    const Host = staticHosts[as]
    return <Host className={className}>{children}</Host>
  }

  const MotionHost = motionHosts[as]
  return (
    <MotionHost className={className} variants={revealContainerVariants} initial="hidden" animate="show">
      {children}
    </MotionHost>
  )
}

/** A single cascading child of `Reveal`. */
export function RevealItem({ children, className, as = 'div' }: RevealProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    const Host = staticHosts[as]
    return <Host className={className}>{children}</Host>
  }

  const MotionHost = motionHosts[as]
  return (
    <MotionHost className={className} variants={revealItemVariants}>
      {children}
    </MotionHost>
  )
}
