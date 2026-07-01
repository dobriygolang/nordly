import { useEffect, useRef, useState, type RefObject } from 'react';

import { useT } from '@nordly-i18n';

import type { TaskCard, ConferenceProvider } from '@features/tasks/api/tasks';
import { LOCAL_ONLY } from '@app/config/features';
import type { TrackerSettings } from '@features/calendar/api/calendarClient';
import {
  conferenceDisplay,
  conferenceProvider,
  TASK_EPIC_PALETTE,
} from './lib/taskUi';

interface TaskDetailPopoverProps {
  task: TaskCard;
  settings: TrackerSettings | null;
  anchorRef: RefObject<HTMLElement | null>;
  closing?: boolean;
  onEpicColorChange: (color: string | null) => void;
  onCreateConference: (provider: ConferenceProvider) => Promise<void>;
  onClearConference: () => void;
  onClose: () => void;
}

/** Compact row-attached popover — epic + meeting integrations. */
export function TaskDetailPopover({
  task,
  settings,
  anchorRef,
  closing = false,
  onEpicColorChange,
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
    !LOCAL_ONLY &&
    Boolean(settings?.googleCalendarConnected && !settings.googleReauthRequired);
  const zoomReady =
    !LOCAL_ONLY && Boolean(settings?.zoomConnected && !settings.zoomReauthRequired);

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
    if (LOCAL_ONLY) {
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
      else setError(t('nordly.taskboard.detail_conference_error'));
    } finally {
      setBusy(null);
    }
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
            aria-selected={!task.epicColor}
            title={t('nordly.taskboard.detail_epic_none')}
            className={`nordly-task-detail-pop__epic-dot-btn${!task.epicColor ? ' nordly-task-detail-pop__epic-dot-btn--active' : ''}`}
            onClick={() => onEpicColorChange(null)}
          >
            <span className="nordly-task-detail-pop__epic-dot nordly-task-detail-pop__epic-dot--none" />
          </button>
          {TASK_EPIC_PALETTE.map((color) => {
            const active = task.epicColor === color;
            return (
              <button
                key={color}
                type="button"
                role="option"
                aria-selected={active}
                className={`nordly-task-detail-pop__epic-dot-btn${active ? ' nordly-task-detail-pop__epic-dot-btn--active' : ''}`}
                style={{ '--epic-color': color } as React.CSSProperties}
                onClick={() => onEpicColorChange(active ? null : color)}
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
