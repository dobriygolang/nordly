import { describe, expect, it, vi } from 'vitest';

vi.mock('@features/calendar/api/calendar', () => ({
  createGoogleCalendarEvent: vi.fn(),
  deleteGoogleCalendarEvent: vi.fn(),
  refreshGoogleCalendarCache: vi.fn(),
  updateGoogleCalendarEvent: vi.fn(),
}));

import type {
  CalendarEntry,
  GoogleCalendarEvent,
} from '@features/calendar/api/calendar';

import {
  submitCalendarEditor,
  type CalendarEditorDependencies,
} from '../useCalendarEditor';

function googleEvent(): GoogleCalendarEvent {
  return {
    id: 'event-1',
    title: 'Review',
    start: '2026-07-15T09:00:00.000Z',
    end: '2026-07-15T10:00:00.000Z',
    allDay: false,
    calendarId: 'primary',
    htmlLink: 'https://calendar.google.com/event',
    editable: true,
  };
}

function dependencies(): CalendarEditorDependencies {
  return {
    createTask: vi.fn(async () => ({ id: 'task-1' })),
    scheduleTask: vi.fn(async () => undefined),
    notifyTasksChanged: vi.fn(),
    refreshTasks: vi.fn(async () => undefined),
    createGoogleEvent: vi.fn(async () => googleEvent()),
    updateGoogleEvent: vi.fn(async () => googleEvent()),
    deleteGoogleEvent: vi.fn(async () => undefined),
    refreshGoogleCache: vi.fn(async () => undefined),
    onCommitted: vi.fn(),
  };
}

describe('submitCalendarEditor', () => {
  it('creates, schedules, publishes, then refreshes a task', async () => {
    const deps = dependencies();
    const start = new Date(2026, 6, 15, 9, 0);
    const result = await submitCalendarEditor(
      {
        mode: 'create',
        kind: 'task',
        title: '  Plan sprint  ',
        start,
        end: new Date(2026, 6, 15, 9, 45),
      },
      deps,
    );

    expect(result).toBe('task');
    expect(deps.createTask).toHaveBeenCalledWith('Plan sprint');
    expect(deps.scheduleTask).toHaveBeenCalledWith('task-1', start, 45);
    expect(deps.notifyTasksChanged).toHaveBeenCalledOnce();
    expect(deps.onCommitted).toHaveBeenCalledOnce();
    expect(deps.refreshTasks).toHaveBeenCalledOnce();
  });

  it('preserves Google event timing and calendar when editing', async () => {
    const deps = dependencies();
    const entry: CalendarEntry = {
      id: 'google:event-1',
      source: 'google',
      title: 'Review',
      start: new Date(2026, 6, 15, 9, 0),
      end: new Date(2026, 6, 15, 10, 0),
      allDay: false,
      googleEventId: 'event-1',
      googleCalendarId: 'calendar-1',
      googleEditable: true,
    };

    const result = await submitCalendarEditor(
      { mode: 'edit', entry, title: '  Updated review  ' },
      deps,
    );

    expect(result).toBe('google');
    expect(deps.updateGoogleEvent).toHaveBeenCalledWith('event-1', {
      title: 'Updated review',
      start: entry.start,
      end: entry.end,
      allDay: false,
      calendarId: 'calendar-1',
    });
    expect(deps.onCommitted).toHaveBeenCalledOnce();
    expect(deps.refreshGoogleCache).toHaveBeenCalledOnce();
  });
});
