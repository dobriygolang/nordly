import type { ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'framer-motion'

const revealEase = [0.16, 1, 0.3, 1] as const

const containerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.04 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: revealEase } },
}

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
 * sequence, matching the landing hero cascade. Falls back to a static element
 * when the user prefers reduced motion.
 */
export function Reveal({ children, className, as = 'div' }: RevealProps) {
  const reduced = useReducedMotion()

  if (reduced) {
    const Host = staticHosts[as]
    return <Host className={className}>{children}</Host>
  }

  const MotionHost = motionHosts[as]
  return (
    <MotionHost className={className} variants={containerVariants} initial="hidden" animate="show">
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
    <MotionHost className={className} variants={itemVariants}>
      {children}
    </MotionHost>
  )
}
