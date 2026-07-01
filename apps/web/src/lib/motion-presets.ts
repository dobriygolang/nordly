import { useReducedMotion, type MotionProps, type Transition } from 'framer-motion'

const pageEase = [0.16, 1, 0.3, 1] as const

export const pageTransition: Transition = {
  duration: 0.28,
  ease: pageEase,
}

export const pageTransitionMotion: MotionProps = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: pageTransition,
}

export function usePageTransition(): MotionProps {
  const reduced = useReducedMotion()
  if (reduced) return {}
  return pageTransitionMotion
}
