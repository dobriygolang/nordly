import { describe, expect, it } from 'vitest';

import type { GoogleCalendarEvent } from '@features/calendar/model/calendar';
import type { TaskCard } from '@features/tasks/api/tasks';
import { googleToCalendarEntries, linkedGoogleEventIds } from '../events';

function task(partial: Partial<TaskCard> & Pick<TaskCard, 'id' | 'title'>): TaskCard {
  return {
    status: 'todo',
    kind: 'custom',
    createdAt: '2026-07-15T10:00:00+03:00',
    updatedAt: '2026-07-15T10:00:00+03:00',
    ...partial,
  };
}

function googleEvent(partial: Partial<GoogleCalendarEvent> & Pick<GoogleCalendarEvent, 'id' | 'title' | 'start'>): GoogleCalendarEvent {
  return {
    end: partial.end ?? '2026-07-15T12:00:00+03:00',
    allDay: false,
    calendarId: 'primary',
    htmlLink: 'https://calendar.google.com',
    editable: true,
    ...partial,
  };
}

describe('googleToCalendarEntries Meet dedupe', () => {
  it('hides Google twin when task.googleEventId matches', () => {
    const tasks = [
      task({
        id: 't1',
        title: 'Boss review',
        googleEventId: 'g-1',
        conferenceProvider: 'meet',
        conferenceUrl: 'https://meet.google.com/abc',
        scheduledStart: '2026-07-15T11:30:00+03:00',
        scheduledDurationMin: 30,
      }),
    ];
    const events = [
      googleEvent({ id: 'g-1', title: 'Boss review', start: '2026-07-15T11:30:00+03:00' }),
      googleEvent({ id: 'g-other', title: 'Other', start: '2026-07-15T14:00:00+03:00' }),
    ];
    const out = googleToCalendarEntries(events, linkedGoogleEventIds(tasks), tasks);
    expect(out.map((e) => e.googleEventId)).toEqual(['g-other']);
  });

  it('hides orphan Google twin by meet title + start when googleEventId missing', () => {
    const tasks = [
      task({
        id: 't1',
        title: 'Boss review',
        conferenceProvider: 'meet',
        conferenceUrl: 'https://meet.google.com/abc',
        scheduledStart: '2026-07-15T11:30:00+03:00',
        scheduledDurationMin: 30,
      }),
    ];
    const events = [
      googleEvent({ id: 'orphan', title: '  Boss  review ', start: '2026-07-15T11:30:30+03:00' }),
    ];
    const out = googleToCalendarEntries(events, linkedGoogleEventIds(tasks), tasks);
    expect(out).toHaveLength(0);
  });

  it('keeps unrelated Google events with similar titles at other times', () => {
    const tasks = [
      task({
        id: 't1',
        title: 'Boss review',
        conferenceProvider: 'meet',
        conferenceUrl: 'https://meet.google.com/abc',
        scheduledStart: '2026-07-15T11:30:00+03:00',
        scheduledDurationMin: 30,
      }),
    ];
    const events = [
      googleEvent({ id: 'later', title: 'Boss review', start: '2026-07-15T16:00:00+03:00' }),
    ];
    const out = googleToCalendarEntries(events, linkedGoogleEventIds(tasks), tasks);
    expect(out).toHaveLength(1);
  });
});
