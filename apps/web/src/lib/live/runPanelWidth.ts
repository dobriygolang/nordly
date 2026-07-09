export const RUN_PANEL_WIDTH_KEY = 'nordly_live_run_panel_width'
export const RUN_PANEL_MIN = 200
export const RUN_PANEL_MAX_PX = 640
export const RUN_PANEL_MAX_RATIO = 0.55

export function runPanelMaxWidth(viewportWidth = window.innerWidth): number {
  return Math.min(RUN_PANEL_MAX_PX, Math.round(viewportWidth * RUN_PANEL_MAX_RATIO))
}

export function clampRunPanelWidth(width: number, viewportWidth = window.innerWidth): number {
  return Math.max(RUN_PANEL_MIN, Math.min(runPanelMaxWidth(viewportWidth), Math.round(width)))
}

export function defaultRunPanelWidth(viewportWidth = window.innerWidth): number {
  return clampRunPanelWidth(Math.min(420, Math.round(viewportWidth * 0.38)), viewportWidth)
}

export function readRunPanelWidth(): number {
  try {
    const raw = sessionStorage.getItem(RUN_PANEL_WIDTH_KEY)
    if (raw) {
      const n = Number.parseInt(raw, 10)
      if (Number.isFinite(n)) return clampRunPanelWidth(n)
    }
  } catch {
    /* sessionStorage blocked */
  }
  return defaultRunPanelWidth()
}

export function persistRunPanelWidth(width: number): void {
  try {
    sessionStorage.setItem(RUN_PANEL_WIDTH_KEY, String(clampRunPanelWidth(width)))
  } catch {
    /* sessionStorage blocked */
  }
}
