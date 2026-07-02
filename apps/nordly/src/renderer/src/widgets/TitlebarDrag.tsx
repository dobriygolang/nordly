import { useCallback, type MouseEvent } from 'react';

import { getCurrentWindow } from '@tauri-apps/api/window';

import { isTauriRuntime } from '@platform/runtime';

/** Top drag handle — macOS overlay titlebar + wordmark row. */
export function TitlebarDrag(): JSX.Element {
  const onMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [data-no-drag]')) {
      return;
    }
    if (!isTauriRuntime()) return;
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
