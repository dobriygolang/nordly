import { useCallback, type MouseEvent } from 'react';

import { getCurrentWindow } from '@tauri-apps/api/window';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Top drag handle — macOS overlay titlebar + wordmark row. */
export function TitlebarDrag(): JSX.Element {
  const onMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [data-no-drag]')) {
      return;
    }
    if (!isTauri()) return;
    void getCurrentWindow().startDragging();
  }, []);

  return (
    <div
      className="nordly-titlebar-drag"
      data-tauri-drag-region
      onMouseDown={onMouseDown}
    />
  );
}
