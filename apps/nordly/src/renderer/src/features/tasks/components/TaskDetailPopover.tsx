import { useEffect, useRef, useState, type RefObject } from 'react';

import { useT } from '@nordly-i18n';

import type { TaskEpic } from '@features/tasks/api/epics';
import { isOfflineEpicId } from '@features/tasks/api/epics';
import { isCloudEnabled } from '@shared/model/features';
import { openExternalUrl, type TrackerSettings } from '@features/calendar/api/calendarClient';
import { isEpicActive, tagDisplayName, taskHasEpic } from '@features/tasks/lib/epicColor';
import {
  TaskActionError,
  TaskActionErrorCode,
} from '@features/tasks/lib/taskActionErrors';
import { conferenceProvider } from '@features/tasks/lib/taskUi';
import { ConferenceProvider } from '@features/tasks/model/status';
import type {
  TaskCard,
  TaskEpicSelection,
} from '@features/tasks/model/task';
import { Icon } from '@shared/ui/primitives/Icon';
import { useDialogSurface } from '@shared/hooks/useDialogSurface';

function openConferenceLink(url: string): void {
  void navigator.clipboard.writeText(url).catch((err) => {
    console.warn('[taskDetail] clipboard write failed', err);
  });
  openExternalUrl(url);
}

interface TaskDetailPopoverProps {
  task: TaskCard;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  anchorRef: RefObject<HTMLElement | null>;
  closing?: boolean;
  onEpicChange: (selection: TaskEpicSelection) => void;
  onCreateConference: (provider: ConferenceProvider) => Promise<TaskCard | void>;
  onClearConference: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

/** Compact row-attached toolbar — tag dots, video, delete. */
export function TaskDetailPopover({
  task,
  epics,
  settings,
  anchorRef,
  closing = false,
  onEpicChange,
  onCreateConference,
  onClearConference,
  onDelete,
  onClose,
}: TaskDetailPopoverProps): JSX.Element {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<ConferenceProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const provider = conferenceProvider(task.conferenceUrl, task.conferenceProvider);

  const googleReady =
    isCloudEnabled() &&
    Boolean(settings?.googleCalendarConnected && !settings.googleReauthRequired);
  const zoomReady =
    isCloudEnabled() && Boolean(settings?.zoomConnected && !settings.zoomReauthRequired);

  useDialogSurface(rootRef, onClose, { active: !closing });

  useEffect(() => {
    if (closing) return;
    const onDoc = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
    };
  }, [onClose, anchorRef, closing]);

  const handleCreate = async (p: ConferenceProvider): Promise<void> => {
    if (!isCloudEnabled()) {
      setError(t('nordly.taskboard.detail_cloud_required'));
      return;
    }
    if (p === ConferenceProvider.Meet && !googleReady) {
      setError(t('nordly.taskboard.detail_connect_google'));
      return;
    }
    if (p === ConferenceProvider.Zoom && !zoomReady) {
      setError(t('nordly.taskboard.detail_connect_zoom'));
      return;
    }
    setError(null);
    setBusy(p);
    try {
      await onCreateConference(p);
    } catch (e) {
      const code = e instanceof TaskActionError ? e.code : null;
      if (
        code === TaskActionErrorCode.GoogleNotConnected ||
        code === TaskActionErrorCode.GoogleReauthRequired
      ) {
        setError(t('nordly.taskboard.detail_connect_google'));
      } else if (
        code === TaskActionErrorCode.ZoomNotConnected ||
        code === TaskActionErrorCode.ZoomReauthRequired
      ) {
        setError(t('nordly.taskboard.detail_connect_zoom'));
      } else if (code === TaskActionErrorCode.TaskNotSynced) {
        setError(t('nordly.taskboard.detail_sync_task_first'));
      } else if (code === TaskActionErrorCode.ConferenceNotAvailable) {
        setError(t('nordly.taskboard.detail_conference_unavailable'));
      } else {
        setError(t('nordly.taskboard.detail_conference_error'));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleTagPick = (epic: TaskEpic): void => {
    const active = isEpicActive(task, epic);
    if (active) {
      onEpicChange(null);
      return;
    }
    if (isOfflineEpicId(epic.id)) {
      onEpicChange({ color: epic.color });
      return;
    }
    onEpicChange({ epicId: epic.id });
  };

  return (
    <div
      ref={rootRef}
      className="nordly-task-detail-pop"
      data-closing={closing ? 'true' : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={t('nordly.taskboard.detail_aria')}
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="nordly-task-detail-pop__toolbar" role="toolbar" aria-label={t('nordly.taskboard.detail_aria')}>
        <div className="nordly-task-detail-pop__epics" role="listbox" aria-label={t('nordly.taskboard.detail_tag')}>
          <button
            type="button"
            role="option"
            aria-selected={!taskHasEpic(task)}
            title={t('nordly.taskboard.detail_tag_none')}
            className={`nordly-task-detail-pop__epic-dot-btn${!taskHasEpic(task) ? ' nordly-task-detail-pop__epic-dot-btn--active' : ''}`}
            onClick={() => onEpicChange(null)}
          >
            <span className="nordly-task-detail-pop__epic-dot nordly-task-detail-pop__epic-dot--none" />
          </button>
          {epics.map((epic) => {
            const active = isEpicActive(task, epic);
            const label = tagDisplayName(epic, t);
            return (
              <button
                key={epic.id}
                type="button"
                role="option"
                aria-selected={active}
                title={label}
                className={`nordly-task-detail-pop__epic-dot-btn${active ? ' nordly-task-detail-pop__epic-dot-btn--active' : ''}`}
                style={{ '--epic-color': epic.color } as React.CSSProperties}
                onClick={() => handleTagPick(epic)}
              >
                <span className="nordly-task-detail-pop__epic-dot" aria-hidden />
              </button>
            );
          })}
        </div>

        <span className="nordly-task-detail-pop__sep" aria-hidden />

        {provider && task.conferenceUrl ? (
          <div className="nordly-task-detail-pop__video">
            <button
              type="button"
              className={`nordly-task-detail-pop__icon-btn nordly-task-detail-pop__icon-btn--${provider}`}
              title={t('nordly.taskboard.join_meeting')}
              aria-label={t('nordly.taskboard.join_meeting')}
              onClick={() => openConferenceLink(task.conferenceUrl!)}
            >
              <Icon name="video" size={12} />
            </button>
            <button
              type="button"
              className="nordly-task-detail-pop__icon-btn"
              title={t('nordly.taskboard.detail_remove_meeting')}
              aria-label={t('nordly.taskboard.detail_remove_meeting')}
              onClick={() => onClearConference()}
            >
              <Icon name="unlink" size={12} />
            </button>
          </div>
        ) : (
          <div className="nordly-task-detail-pop__video">
            <button
              type="button"
              className="nordly-task-detail-pop__chip nordly-task-detail-pop__chip--meet"
              title={t('nordly.taskboard.detail_add_meet')}
              aria-label={t('nordly.taskboard.detail_add_meet')}
              disabled={busy !== null}
              onClick={() => void handleCreate(ConferenceProvider.Meet)}
            >
              {busy === ConferenceProvider.Meet
                ? t('nordly.taskboard.detail_creating')
                : t('nordly.taskboard.detail_create_meet')}
            </button>
            <button
              type="button"
              className="nordly-task-detail-pop__chip nordly-task-detail-pop__chip--zoom"
              title={t('nordly.taskboard.detail_add_zoom')}
              aria-label={t('nordly.taskboard.detail_add_zoom')}
              disabled={busy !== null}
              onClick={() => void handleCreate(ConferenceProvider.Zoom)}
            >
              {busy === ConferenceProvider.Zoom
                ? t('nordly.taskboard.detail_creating')
                : t('nordly.taskboard.detail_create_zoom')}
            </button>
          </div>
        )}

        {onDelete ? (
          <>
            <span className="nordly-task-detail-pop__sep" aria-hidden />
            <button
              type="button"
              className="nordly-task-detail-pop__icon-btn nordly-task-detail-pop__icon-btn--danger"
              title={t('nordly.taskboard.detail_delete')}
              aria-label={t('nordly.taskboard.detail_delete')}
              onClick={() => {
                onClose();
                onDelete();
              }}
            >
              <Icon name="trash" size={12} />
            </button>
          </>
        ) : null}
      </div>

      {error && <p className="nordly-task-detail-pop__error">{error}</p>}
    </div>
  );
}
