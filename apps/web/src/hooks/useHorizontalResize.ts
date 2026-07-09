import { useCallback, useEffect, useRef, useState } from 'react'

const MOVE_THRESHOLD_PX = 3

interface ResizeConfig {
  baseWidth: number
  min: number
  max: number
  onCommit: (width: number) => void
}

interface Session extends ResizeConfig {
  startX: number
  pointerId: number
  el: HTMLElement
  moved: boolean
}

/** Horizontal resize — drag left edge of a right-side panel (drag left = wider). */
export function useHorizontalResize(setWidth: (width: number) => void): {
  isResizing: boolean
  start: (e: React.PointerEvent, cfg: ResizeConfig) => void
} {
  const [isResizing, setIsResizing] = useState(false)
  const sessionRef = useRef<Session | null>(null)

  const start = useCallback(
    (e: React.PointerEvent, cfg: ResizeConfig) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const el = e.currentTarget as HTMLElement
      try {
        el.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      sessionRef.current = {
        ...cfg,
        baseWidth: cfg.baseWidth,
        startX: e.clientX,
        pointerId: e.pointerId,
        el,
        moved: false,
      }
      setIsResizing(true)
    },
    [setWidth],
  )

  useEffect(() => {
    const clampWidth = (s: Session, dx: number) =>
      Math.max(s.min, Math.min(s.max, s.baseWidth - dx))

    const onMove = (e: PointerEvent) => {
      const s = sessionRef.current
      if (!s || e.pointerId !== s.pointerId) return
      const dx = e.clientX - s.startX
      if (Math.abs(dx) > MOVE_THRESHOLD_PX) s.moved = true
      setWidth(clampWidth(s, dx))
    }

    const finish = (e: PointerEvent) => {
      const s = sessionRef.current
      if (!s || e.pointerId !== s.pointerId) return
      const next = clampWidth(s, e.clientX - s.startX)
      try {
        s.el.releasePointerCapture(s.pointerId)
      } catch {
        /* ignore */
      }
      sessionRef.current = null
      setIsResizing(false)
      setWidth(next)
      if (s.moved) s.onCommit(next)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [setWidth])

  useEffect(() => {
    if (!isResizing) return
    const prev = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.userSelect = prev
    }
  }, [isResizing])

  return { isResizing, start }
}
