import { useEffect, useRef, useState, type RefObject } from 'react';

import { useT } from '@nordly-i18n';

import type { TaskCard, ConferenceProvider, TaskEpicSelection } from '@features/tasks/api/tasks';
import type { TaskEpic } from '@features/tasks/api/epics';
import { isOfflineEpicId } from '@features/tasks/api/epics';
import { isCloudEnabled } from '@shared/model/features';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import { isEpicActive, taskHasEpic } from '@features/tasks/lib/epicColor';
import {
  conferenceDisplay,
  conferenceProvider,
} from '@features/tasks/lib/taskUi';

interface TaskDetailPopoverProps {
  task: TaskCard;
  epics: TaskEpic[];
  settings: TrackerSettings | null;
  anchorRef: RefObject<HTMLElement | null>;
  closing?: boolean;
  onEpicChange: (selection: TaskEpicSelection) => void;
  onCreateConference: (provider: ConferenceProvider) => Promise<void>;
  onClearConference: () => void;
  onClose: () => void;
}

/** Compact row-attached popover — epic + meeting integrations. */
export function TaskDetailPopover({
  task,
  epics,
  settings,
  anchorRef,
  closing = false,
  onEpicChange,
  onCreateConference,
  onClearConference,
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

  useEffect(() => {
    if (closing) return;
    const onDoc = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchorRef, closing]);

  const handleCreate = async (p: ConferenceProvider): Promise<void> => {
    if (!isCloudEnabled()) {
      setError(t('nordly.taskboard.detail_cloud_required'));
      return;
    }
    if (p === 'meet' && !googleReady) {
      setError(t('nordly.taskboard.detail_connect_google'));
      return;
    }
    if (p === 'zoom' && !zoomReady) {
      setError(t('nordly.taskboard.detail_connect_zoom'));
      return;
    }
    setError(null);
    setBusy(p);
    try {
      await onCreateConference(p);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('google_not_connected')) setError(t('nordly.taskboard.detail_connect_google'));
      else if (msg.includes('zoom_not_connected')) setError(t('nordly.taskboard.detail_connect_zoom'));
      else if (msg.includes('task_not_synced')) setError(t('nordly.taskboard.detail_sync_task_first'));
      else if (msg.includes('conference_not_available')) setError(t('nordly.taskboard.detail_conference_unavailable'));
      else setError(t('nordly.taskboard.detail_conference_error'));
    } finally {
      setBusy(null);
    }
  };

  const handleEpicPick = (epic: TaskEpic): void => {
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
      aria-label={t('nordly.taskboard.detail_aria')}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="nordly-task-detail-pop__row">
        <span className="nordly-task-detail-pop__label">{t('nordly.taskboard.detail_epic')}</span>
        <div className="nordly-task-detail-pop__epics" role="listbox" aria-label={t('nordly.taskboard.detail_epic')}>
          <button
            type="button"
            role="option"
            aria-selected={!taskHasEpic(task)}
            title={t('nordly.taskboard.detail_epic_none')}
            className={`nordly-task-detail-pop__epic-dot-btn${!taskHasEpic(task) ? ' nordly-task-detail-pop__epic-dot-btn--active' : ''}`}
            onClick={() => onEpicChange(null)}
          >
            <span className="nordly-task-detail-pop__epic-dot nordly-task-detail-pop__epic-dot--none" />
          </button>
          {epics.map((epic) => {
            const active = isEpicActive(task, epic);
            return (
              <button
                key={epic.id}
                type="button"
                role="option"
                aria-selected={active}
                title={epic.name || epic.color}
                className={`nordly-task-detail-pop__epic-dot-btn${active ? ' nordly-task-detail-pop__epic-dot-btn--active' : ''}`}
                style={{ '--epic-color': epic.color } as React.CSSProperties}
                onClick={() => handleEpicPick(epic)}
              >
                <span className="nordly-task-detail-pop__epic-dot" aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      <div className="nordly-task-detail-pop__row">
        <span className="nordly-task-detail-pop__label">{t('nordly.taskboard.detail_video')}</span>

        {provider && task.conferenceUrl ? (
          <div className="nordly-task-detail-pop__meet-active">
            <span
              className={`nordly-task-detail-pop__meet-badge nordly-task-detail-pop__meet-badge--${provider}`}
            >
              {provider === 'meet' && t('nordly.taskboard.detail_provider_meet_short')}
              {provider === 'zoom' && t('nordly.taskboard.detail_provider_zoom_short')}
              {provider === 'other' && t('nordly.taskboard.detail_provider_other_short')}
            </span>
            <a
              href={task.conferenceUrl}
              className="mono nordly-task-detail-pop__meet-link"
              target="_blank"
              rel="noopener noreferrer"
              title={task.conferenceUrl}
            >
              {conferenceDisplay(task.conferenceUrl)}
            </a>
            <button
              type="button"
              className="nordly-task-detail-pop__meet-remove"
              aria-label={t('nordly.taskboard.detail_remove_meeting')}
              onClick={() => onClearConference()}
            >
              ×
            </button>
          </div>
        ) : (
          <div className="nordly-task-detail-pop__integrations">
            <button
              type="button"
              className="nordly-task-detail-pop__integration nordly-task-detail-pop__integration--meet"
              title={t('nordly.taskboard.detail_add_meet')}
              disabled={busy !== null}
              onClick={() => void handleCreate('meet')}
            >
              <span className="nordly-task-detail-pop__integration-dot" aria-hidden />
              <span>
                {busy === 'meet'
                  ? t('nordly.taskboard.detail_creating')
                  : t('nordly.taskboard.detail_create_meet')}
              </span>
            </button>
            <button
              type="button"
              className="nordly-task-detail-pop__integration nordly-task-detail-pop__integration--zoom"
              title={t('nordly.taskboard.detail_add_zoom')}
              disabled={busy !== null}
              onClick={() => void handleCreate('zoom')}
            >
              <span className="nordly-task-detail-pop__integration-dot" aria-hidden />
              <span>
                {busy === 'zoom'
                  ? t('nordly.taskboard.detail_creating')
                  : t('nordly.taskboard.detail_create_zoom')}
              </span>
            </button>
          </div>
        )}
      </div>

      {error && <p className="nordly-task-detail-pop__error">{error}</p>}
    </div>
  );
}
