import { useT, useLocale, type Locale } from '@nordly-i18n';

import type { CalendarEntry } from '@features/calendar/lib/events';
import { CalendarEntrySource } from '@features/calendar/model/entry';
import { resolveTaskEpicColor } from '@features/tasks/lib/epicColor';
import { focusSecondsTodayForTask, useHomeTodayTasks } from '@features/tasks/hooks/useHomeTodayTasks';
import { taskDurationMin } from '@features/tasks/model/duration';
import { isTaskDone } from '@features/tasks/model/status';
import { toDayKey } from '@shared/lib/dates';
import { formatLocaleTime } from '@shared/lib/localeFormat';
import { useFlipList } from '@shared/lib/useFlipList';
import { usePomodoroStore } from '@shared/model/pomodoro';
import { TimerMode } from '@shared/model/settings';
import { OdometerTimer } from '@shared/ui/OdometerTimer';
import { Icon } from '@shared/ui/primitives/Icon';

function formatMeetingWhen(entry: CalendarEntry, todayKey: string, locale: Locale): string {
  const time = formatLocaleTime(entry.start, locale);
  if (toDayKey(entry.start) === todayKey) return time;
  const day = entry.start.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  return `${day} · ${time}`;
}

export function HomeTodayTasks(): JSX.Element | null {
  const t = useT();
  const [locale] = useLocale();
  const home = useHomeTodayTasks();
  const activeId = usePomodoroStore((s) => s.pinnedPlanItemId);
  const pinnedTitle = usePomodoroStore((s) => s.pinnedTitle);
  const running = usePomodoroStore((s) => s.running);
  const mode = usePomodoroStore((s) => s.mode);
  const remain = usePomodoroStore((s) => s.remain);
  const elapsed = usePomodoroStore((s) => s.elapsed);
  const durationSec = usePomodoroStore((s) => s.durationSec);
  const toggle = usePomodoroStore((s) => s.toggle);

  const listRef = useFlipList(home.todayTasks.map((task) => task.id));
  const meetingsRef = useFlipList(home.upcomingMeetings.map((m) => m.id));

  if (!home.sessionReady) return null;

  if (home.loadError) {
    return (
      <section className="nordly-home-today" aria-label={t('nordly.home.today_aria')}>
        <p className="nordly-home-today__empty mono" role="alert">
          {home.loadError.message}
        </p>
      </section>
    );
  }

  if (home.todayTasks.length === 0 && home.upcomingMeetings.length === 0 && !home.planFinalized) {
    return (
      <section className="nordly-home-today" aria-label={t('nordly.home.today_aria')}>
        <p className="nordly-home-today__empty mono">{t('nordly.home.today_empty')}</p>
      </section>
    );
  }

  return (
    <section className="nordly-home-today" aria-label={t('nordly.home.today_aria')}>
      {home.todayTasks.length === 0 ? (
        home.upcomingMeetings.length === 0 ? (
          <p className="nordly-home-today__empty mono">{t('nordly.home.today_empty')}</p>
        ) : null
      ) : (
        <div className="nordly-home-today__list" ref={listRef} role="list">
          {home.todayTasks.map((task) => {
            const done = isTaskDone(task.status);
            const epicColor = resolveTaskEpicColor(task, home.epics);
            const isActive = activeId === task.id;
            const focusedTodaySec = focusSecondsTodayForTask(home.focusSessions, task.id, home.todayKey);
            const activeSessionSec =
              isActive
                ? mode === TimerMode.Pomodoro
                  ? Math.max(0, durationSec - remain)
                  : elapsed
                : 0;
            const timerSec = Math.max(
              0,
              taskDurationMin(task) * 60 - focusedTodaySec - activeSessionSec,
            );

            return (
              <div
                key={task.id}
                data-flip-key={task.id}
                className="nordly-home-today__item"
                role="listitem"
                data-done={done ? 'true' : undefined}
                data-active={isActive ? 'true' : undefined}
                data-open={done ? undefined : 'true'}
              >
                <button
                  type="button"
                  className="nordly-home-today__main focus-ring"
                  onClick={() => void home.toggleTaskOpen(task)}
                >
                  {epicColor ? (
                    <span className="nordly-home-today__stripe" style={{ background: epicColor }} aria-hidden />
                  ) : null}
                  <span className="nordly-home-today__title">{task.title}</span>
                </button>
                {!done ? (
                  <span className="nordly-home-today__meta">
                    <OdometerTimer
                      totalSec={timerSec}
                      running={isActive && running}
                      className="nordly-home-today__timer"
                    />
                    <button
                      type="button"
                      className="nordly-home-today__play focus-ring"
                      title={t('nordly.home.today_start_focus')}
                      aria-label={t('nordly.home.today_start_focus')}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isActive) toggle();
                        else home.startPomodoro(task);
                      }}
                    >
                      <Icon
                        name={isActive && running ? 'pause' : 'play-outline'}
                        size={12}
                        strokeWidth={2}
                      />
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {home.upcomingMeetings.length > 0 ? (
        <section className="nordly-home-today__meetings" aria-label={t('nordly.home.meetings_aria')}>
          <h3 className="nordly-home-today__meetings-heading">{t('nordly.home.meetings_heading')}</h3>
          <div className="nordly-home-today__list" ref={meetingsRef} role="list">
            {home.upcomingMeetings.map((meeting) => {
              const isActive = meeting.taskId
                ? activeId === meeting.taskId
                : !activeId && pinnedTitle === meeting.title;
              const canOpen =
                meeting.source === CalendarEntrySource.Google ||
                meeting.source === CalendarEntrySource.Apple ||
                Boolean(meeting.conferenceUrl);
              return (
                <div
                  key={meeting.id}
                  data-flip-key={meeting.id}
                  className="nordly-home-today__item nordly-home-today__item--meeting"
                  role="listitem"
                  data-active={isActive ? 'true' : undefined}
                  data-source={meeting.source}
                >
                  {canOpen ? (
                    <button
                      type="button"
                      className="nordly-home-today__main focus-ring"
                      title={meeting.title}
                      onClick={() => home.openMeeting(meeting)}
                    >
                      <span className="nordly-home-today__stripe" data-source={meeting.source} aria-hidden />
                      <span className="nordly-home-today__title">{meeting.title}</span>
                    </button>
                  ) : (
                    <div className="nordly-home-today__main nordly-home-today__main--static">
                      <span className="nordly-home-today__stripe" data-source={meeting.source} aria-hidden />
                      <span className="nordly-home-today__title" title={meeting.title}>
                        {meeting.title}
                      </span>
                    </div>
                  )}
                  <span className="nordly-home-today__meta">
                    <span className="nordly-home-today__when mono">
                      {formatMeetingWhen(meeting, home.todayKey, locale)}
                    </span>
                    <button
                      type="button"
                      className="nordly-home-today__play focus-ring"
                      title={t('nordly.home.meeting_start_focus')}
                      aria-label={t('nordly.home.meeting_start_focus')}
                      onClick={() => {
                        if (isActive) toggle();
                        else home.startMeetingFocus(meeting);
                      }}
                    >
                      <Icon
                        name={isActive && running ? 'pause' : 'play-outline'}
                        size={12}
                        strokeWidth={2}
                      />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {home.planFinalized && home.obstacles.length > 0 ? (
        <section className="nordly-home-today__obstacles" aria-label={t('nordly.planning.obstacles_heading')}>
          <h3 className="nordly-home-today__obstacles-heading">{t('nordly.planning.obstacles_heading')}</h3>
          <ul className="nordly-home-today__obstacles-list">
            {home.obstacles.map((item, index) => (
              <li key={`home-obstacle-${index}`} className="nordly-home-today__obstacles-item">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
