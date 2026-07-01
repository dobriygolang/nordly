import { useReducedMotion, type MotionProps, type Transition } from 'framer-motion'

const pageEase = [0.2, 0.7, 0.2, 1] as const

export const pageTransition: Transition = {
  duration: 0.18,
  ease: pageEase,
}

/** Gentle fade-in for routed content — header stays mounted. */
export const pageTransitionMotion: MotionProps = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: pageTransition,
}

export function usePageTransition(): MotionProps {
  const reduced = useReducedMotion()
  if (reduced) return {}
  return pageTransitionMotion
}
