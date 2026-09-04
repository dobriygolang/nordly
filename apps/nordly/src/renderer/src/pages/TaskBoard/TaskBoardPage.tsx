import { useLocale, useT } from '@nordly-i18n';

import { CalendarEventEditor } from '@features/calendar/components/CalendarEventEditor';
import { DayColumn } from '@features/tasks/components/DayColumn';
import { DayTaskDndContext } from '@features/tasks/components/DayTaskDndContext';
import { DayTimeline } from '@features/tasks/components/DayTimeline';
import { DAY_COL_GAP, DAY_COL_STRIDE } from '@features/tasks/hooks/useInfiniteDayScroll';
import { useTaskBoardPage } from '@features/tasks/hooks/useTaskBoardPage';
import type { EntityNavigationRequest } from '@shared/model/navigation';

interface TaskBoardPageProps {
  openRequest?: EntityNavigationRequest | null;
  onConsumeOpenRequest?: (requestKey: number) => void;
}

export function TaskBoardPage({
  openRequest,
  onConsumeOpenRequest,
}: TaskBoardPageProps = {}): JSX.Element {
  const t = useT();
  const [locale] = useLocale();
  const board = useTaskBoardPage({ openRequest, onConsumeOpenRequest });

  if (board.loadError && !board.sessionReauthRequired) {
    console.error('[nordly:taskboard] load failed', board.loadError);
  }

  const { first: firstVisible, last: lastVisible } = board.visibleRange;
  const leftPad = Math.max(0, firstVisible) * DAY_COL_STRIDE;
  const rightPad = Math.max(0, board.days.length - 1 - lastVisible) * DAY_COL_STRIDE;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        padding: '0 20px 88px',
        display: 'flex',
        gap: 12,
        minHeight: 0,
        WebkitAppRegion: 'no-drag',
      }}
    >
      <div
        className="nordly-task-board-board"
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <DayTaskDndContext dnd={board.dnd} epics={board.epics} settings={board.trackerSettings}>
          <div
            ref={board.scrollRef}
            className="nordly-hide-scrollbar nordly-task-board-scroll"
            style={{
              width: '100%',
              height: '100%',
              minHeight: 0,
              overflowX: 'auto',
              display: 'flex',
              alignItems: 'stretch',
              gap: DAY_COL_GAP,
              paddingLeft: leftPad,
              paddingRight: rightPad,
              WebkitAppRegion: 'no-drag',
            }}
          >
            {board.days.slice(Math.max(0, firstVisible), lastVisible + 1).map((d) => {
              const insertPreviewAt = board.dnd.getColumnInsertPreviewAt(d.key);
              return (
              <DayColumn
                key={d.key}
                dayKey={d.key}
                date={d.date}
                today={board.today}
                taskIds={board.dnd.getColumnTaskIds(d.key)}
                taskById={board.dnd.taskById}
                dropHighlight={board.dnd.overContainerId === d.key && board.dnd.isDragging}
                insertPreviewAt={insertPreviewAt}
                previewTask={insertPreviewAt != null ? board.dnd.activeTask : null}
                detailTaskId={board.detailTaskId}
                epics={board.epics}
                settings={board.trackerSettings}
                editRequest={board.editRequest}
                selected={board.selectedDay === d.key}
                onSelect={() => board.setSelectedDay(d.key)}
                onAddClick={() => board.openAddTask(d.key)}
                onToggleDone={(task) => void board.handleToggleDone(task)}
                onDurationChange={(task, min) => void board.handleDurationChange(task, min)}
                onTitleChange={(task, title) => void board.handleTitleChange(task, title)}
                onOpenDetail={board.handleOpenDetail}
                onCloseDetail={board.handleCloseDetail}
                onEpicChange={(task, selection) => void board.handleEpicChange(task, selection)}
                onCreateConference={board.handleCreateConference}
                onClearConference={(task) => void board.handleClearConference(task)}
                onDelete={(task) => void board.handleDeleteTask(task)}
                onTaskTap={board.handleTaskTap}
              />
              );
            })}
          </div>
        </DayTaskDndContext>
      </div>

      <DayTimeline
        date={board.today}
        tasks={board.tasks}
        epics={board.epics}
        onReschedule={(task, start) => void board.handleReschedule(task, start)}
        onDurationChange={(task, durationMin) => {
          void board.handleDurationChange(task, durationMin);
        }}
        onCreateRange={board.openTaskRange}
      />

      {board.createEditor ? (
        <CalendarEventEditor
          editor={board.createEditor}
          saving={board.createSaving}
          locale={locale}
          onTitleChange={board.setCreateTitle}
          onSave={() => void board.saveCreateEditor()}
          onDelete={() => void board.deleteCreateEditor()}
          onClose={board.closeCreateEditor}
        />
      ) : null}

      {board.showBackToToday && (
        <div className="nordly-back-to-today-anchor">
          <button
            type="button"
            onClick={board.handleBackToToday}
            className="mono fadein nordly-pill-btn"
            aria-label={t('nordly.taskboard.back_to_today')}
            style={{ fontSize: 11, WebkitAppRegion: 'no-drag' }}
          >
            {t('nordly.taskboard.back_to_today')}
          </button>
        </div>
      )}
    </div>
  );
}
