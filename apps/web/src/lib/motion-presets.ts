import { useReducedMotion, type MotionProps, type Transition } from 'framer-motion'

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

export function usePageTransition(): MotionProps {
  const reduced = useReducedMotion()
  if (reduced) return {}
  return pageTransitionMotion
}
