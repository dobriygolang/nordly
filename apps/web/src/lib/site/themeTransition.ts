import { flushSync } from 'react-dom'

export type ThemeToggleOrigin = {
  x: number
  y: number
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function setToggleOrigin(origin: ThemeToggleOrigin): void {
  const root = document.documentElement
  const maxRadius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  )

  root.style.setProperty('--theme-toggle-x', `${origin.x}px`)
  root.style.setProperty('--theme-toggle-y', `${origin.y}px`)
  root.style.setProperty('--theme-toggle-r', `${maxRadius}px`)
}

function runCssThemeFallback(update: () => void): void {
  const root = document.documentElement
  root.classList.add('theme-transition')
  update()
  window.setTimeout(() => {
    root.classList.remove('theme-transition')
  }, 320)
}

export function runThemeTransition(update: () => void, origin?: ThemeToggleOrigin): void {
  if (origin) setToggleOrigin(origin)

  if (prefersReducedMotion()) {
    update()
    return
  }

  const startTransition = document.startViewTransition?.bind(document)
  if (!startTransition) {
    runCssThemeFallback(update)
    return
  }

  startTransition(() => {
    flushSync(update)
  })
}
