import { useReducedMotion, type MotionProps, type Transition, type Variants } from 'framer-motion'

const pageEase = [0.16, 1, 0.3, 1] as const

export const pageTransition: Transition = {
  duration: 0.35,
  ease: pageEase,
}

export const pageExitTransition: Transition = {
  duration: 0.18,
  ease: pageEase,
}

/** Fade for routed content — header/footer stay mounted; layout stays in document flow. */
export const pageTransitionMotion: MotionProps = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: pageTransition },
  exit: { opacity: 0, y: -6, transition: pageExitTransition },
}

/** Matches landing hero `fadeInUp` — used by Reveal on other marketing pages. */
export const revealStagger = 0.1

export const revealItemTransition: Transition = {
  duration: 0.8,
  ease: 'easeOut',
}

export const revealContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: revealStagger },
  },
}

export const revealItemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: revealItemTransition },
}

export function usePageTransition(): MotionProps {
  const reduced = useReducedMotion()
  if (reduced) return {}
  return pageTransitionMotion
}
