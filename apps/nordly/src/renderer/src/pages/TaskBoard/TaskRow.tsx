import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

import { useT } from '@nordly-i18n';

import type { TaskCard, ConferenceProvider } from '@features/tasks/api/tasks';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import { Icon } from '@shared/ui/primitives/Icon';
import { defaultDurationMin } from './lib/dates';
import { epicById, type TaskEpic } from './lib/taskUi';
import { DurationPicker } from './DurationPicker';
import { TaskDetailPopover } from './TaskDetailPopover';

const DETAIL_POP_CLOSE_MS = 140;

interface TaskRowProps {
  task: TaskCard;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  dragging: boolean;
  detailOpen: boolean;
  editRequestKey?: number;
  onToggleDone: (task: TaskCard) => void;
  onDurationChange: (task: TaskCard, minutes: number) => void;
  onTitleChange: (task: TaskCard, title: string) => void;
  onOpenDetail: (task: TaskCard) => void;
  onCloseDetail: () => void;
  onEpicChange: (task: TaskCard, epicId: string | null) => void;
  onCreateConference: (task: TaskCard, provider: ConferenceProvider) => Promise<void>;
  onClearConference: (task: TaskCard) => void;
  onPointerDragStart: (taskId: string, e: React.PointerEvent) => void;
}

export function TaskRow({
  task,
  epics,
  settings,
  dragging,
  detailOpen,
  editRequestKey = 0,
  onToggleDone,
  onDurationChange,
  onTitleChange,
  onOpenDetail,
  onCloseDetail,
  onEpicChange,
  onCreateConference,
  onClearConference,
  onPointerDragStart,
}: TaskRowProps): JSX.Element {
  const t = useT();
  const done = task.status === 'done';
  const epic = epicById(epics, task.epicId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const detailBtnRef = useRef<HTMLButtonElement>(null);
  const [detailMounted, setDetailMounted] = useState(false);
  const [detailClosing, setDetailClosing] = useState(false);
  const detailVisible = detailOpen || detailMounted;

  useEffect(() => {
    if (detailOpen) {
      setDetailMounted(true);
      setDetailClosing(false);
      return;
    }
    if (!detailMounted) return;
    setDetailClosing(true);
    const timer = window.setTimeout(() => {
      setDetailMounted(false);
      setDetailClosing(false);
    }, DETAIL_POP_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [detailOpen, detailMounted]);

  useEffect(() => {
    if (!editing) setDraft(task.title);
  }, [task.title, editing]);

  useEffect(() => {
    if (editRequestKey <= 0) return;
    setDraft(task.title);
    setEditing(true);
  }, [editRequestKey, task.title]);

  const autosize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useLayoutEffect(() => {
    if (!editing) return;
    autosize();
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing, autosize]);

  const commit = useCallback(() => {
    setEditing(false);
    const next = draft.replace(/\s+$/, '');
    if (next && next !== task.title) onTitleChange(task, next);
    else setDraft(task.title);
  }, [draft, task, onTitleChange]);

  const cancel = useCallback(() => {
    setDraft(task.title);
    setEditing(false);
  }, [task.title]);

  return (
    <article
      data-task-row
      data-task-id={task.id}
      data-flip-key={task.id}
      data-done={done ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      data-detail-open={detailVisible ? 'true' : 'false'}
      data-epic={epic ? 'true' : 'false'}
      className="nordly-task-row"
      style={
        epic
          ? ({ '--task-epic-color': epic.color } as CSSProperties)
          : undefined
      }
      onPointerDown={(e) => {
        if (editing) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, textarea, a, [data-no-drag]')) return;
        onPointerDragStart(task.id, e);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        data-no-drag
        className="nordly-task-row__check"
        aria-label={done ? t('nordly.taskboard.mark_incomplete') : t('nordly.taskboard.mark_done')}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone(task);
        }}
      >
        {done ? '✓' : ''}
      </button>

      <div className="nordly-task-row__body">
        {editing ? (
          <textarea
            ref={textareaRef}
            data-no-drag
            value={draft}
            rows={1}
            aria-label={t('nordly.taskboard.edit_title')}
            onChange={(e) => {
              setDraft(e.target.value);
              autosize();
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            style={{
              width: '100%',
              resize: 'none',
              overflow: 'hidden',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              padding: 0,
              margin: 0,
              font: 'inherit',
              fontSize: 13,
              lineHeight: '15px',
              color: 'var(--ink-90)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          />
        ) : (
          <div
            role="textbox"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              setDraft(task.title);
              setEditing(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                setDraft(task.title);
                setEditing(true);
              }
            }}
            style={{
              fontSize: 13,
              lineHeight: '15px',
              color: done ? 'var(--ink-40)' : 'var(--ink-90)',
              textDecoration: done ? 'line-through' : 'none',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              cursor: 'text',
            }}
          >
            {task.title || t('nordly.taskboard.untitled')}
          </div>
        )}
      </div>

      {task.conferenceUrl && (
        <a
          href={task.conferenceUrl}
          data-no-drag
          className="nordly-task-row__meet"
          aria-label={t('nordly.taskboard.join_meeting')}
          title={t('nordly.taskboard.join_meeting')}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="video" size={12} stroke="var(--ink-40)" />
        </a>
      )}

      <button
        type="button"
        data-no-drag
        ref={detailBtnRef}
        className="nordly-task-row__detail"
        aria-label={t('nordly.taskboard.open_details')}
        aria-expanded={detailVisible}
        onClick={(e) => {
          e.stopPropagation();
          onOpenDetail(task);
        }}
      >
        <Icon name="more" size={14} stroke="var(--ink-40)" />
      </button>

      <div className="nordly-task-row__duration" data-no-drag>
        <DurationPicker
          valueMin={defaultDurationMin(task)}
          onChange={(min) => onDurationChange(task, min)}
        />
      </div>

      {detailMounted && (
        <TaskDetailPopover
          task={task}
          epics={epics}
          settings={settings}
          anchorRef={detailBtnRef}
          closing={detailClosing}
          onEpicChange={(epicId) => onEpicChange(task, epicId)}
          onCreateConference={(provider) => onCreateConference(task, provider)}
          onClearConference={() => onClearConference(task)}
          onClose={onCloseDetail}
        />
      )}
    </article>
  );
}
