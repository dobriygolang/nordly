import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

import { boardThemeSceneFromCanonical } from '@/lib/collab/excalidrawBoardColors'
import {
  EXCALIDRAW_MOUNT_CLASS,
  EXCALIDRAW_UI_OPTIONS,
  excalidrawSiteAppState,
  excalidrawThemeFor,
} from '@/lib/collab/excalidrawTheme'

export function PublishedBoardCanvas({
  scene,
}: {
  scene: { elements: unknown[]; files: Record<string, unknown> }
}) {
  return (
    <div
      className={`flex-1 min-h-0 ${EXCALIDRAW_MOUNT_CLASS}`}
      style={{ height: 'calc(100vh - 57px)' }}
      data-board-theme="dark"
    >
      <Excalidraw
        theme={excalidrawThemeFor('dark')}
        UIOptions={EXCALIDRAW_UI_OPTIONS}
        viewModeEnabled
        initialData={{
          elements: boardThemeSceneFromCanonical(
            scene.elements as Parameters<typeof boardThemeSceneFromCanonical>[0],
            'dark',
          ) as never[],
          files: scene.files as never,
          appState: excalidrawSiteAppState('dark'),
        }}
      />
    </div>
  )
}
