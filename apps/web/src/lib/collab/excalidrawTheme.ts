/** Shared Excalidraw chrome — matches site tokens in main.css */

export type BoardCanvasTheme = 'light' | 'dark'

export const EXCALIDRAW_MOUNT_CLASS = 'druzya-excalidraw'

export const EXCALIDRAW_CANVAS = {
  light: '#fafaf8',
  dark: '#000000',
} as const

export const EXCALIDRAW_STROKE = {
  light: '#1e1e1e',
  dark: '#ffffff',
} as const

export const EXCALIDRAW_UI_OPTIONS = {
  canvasActions: { loadScene: false, export: false, changeViewBackgroundColor: false },
} as const

export function excalidrawThemeFor(boardTheme: BoardCanvasTheme): 'light' | 'dark' {
  return boardTheme
}

export function excalidrawCanvasBg(boardTheme: BoardCanvasTheme): string {
  return EXCALIDRAW_CANVAS[boardTheme]
}

export function excalidrawSiteAppState(boardTheme: BoardCanvasTheme = 'dark') {
  return {
    theme: excalidrawThemeFor(boardTheme),
    viewBackgroundColor: excalidrawCanvasBg(boardTheme),
    showWelcomeScreen: false,
    currentItemStrokeColor: EXCALIDRAW_STROKE[boardTheme],
    currentItemBackgroundColor: 'transparent',
  }
}

export function excalidrawCanvasPatch(boardTheme: BoardCanvasTheme) {
  return {
    theme: excalidrawThemeFor(boardTheme),
    viewBackgroundColor: excalidrawCanvasBg(boardTheme),
    currentItemStrokeColor: EXCALIDRAW_STROKE[boardTheme],
    currentItemBackgroundColor: 'transparent',
  }
}

/** @deprecated use excalidrawThemeFor */
export const EXCALIDRAW_THEME = 'dark' as const

/** @deprecated use EXCALIDRAW_CANVAS */
export const EXCALIDRAW_SITE_COLORS = {
  canvas: EXCALIDRAW_CANVAS.light,
} as const
