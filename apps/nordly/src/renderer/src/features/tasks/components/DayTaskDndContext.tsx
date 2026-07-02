import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import { createPortal } from 'react-dom';

import type { TaskEpic } from '@features/tasks/api/epics';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import type { useDayTaskDnd } from '@features/tasks/lib/useDayTaskDnd';

import { DayTaskDragOverlay } from './DayTaskDragOverlay';

type DayTaskDndState = ReturnType<typeof useDayTaskDnd>;

interface DayTaskDndContextProps {
  dnd: DayTaskDndState;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  children: React.ReactNode;
}

const dropAnimation = {
  duration: 250,
  easing: 'ease',
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.5' } },
  }),
};

// Multi-container sortables need fresh droppable rects while items move between
// columns. Without this, the first cross-column collision can use stale positions
// and temporarily insert the preview at the top of the target list.
const measuring = {
  droppable: {
    strategy: MeasuringStrategy.Always,
  },
};

export function DayTaskDndContext({
  dnd,
  epics,
  settings,
  children,
}: DayTaskDndContextProps): JSX.Element {
  return (
    <DndContext
      sensors={dnd.sensors}
      collisionDetection={dnd.collisionDetection}
      measuring={measuring}
      onDragStart={dnd.handleDragStart}
      onDragOver={dnd.handleDragOver}
      onDragEnd={dnd.handleDragEnd}
      onDragCancel={dnd.handleDragCancel}
    >
      {children}
      {createPortal(
        <DragOverlay dropAnimation={dropAnimation} zIndex={9999}>
          <DayTaskDragOverlay task={dnd.activeTask} epics={epics} settings={settings} />
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
