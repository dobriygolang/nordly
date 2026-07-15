import { useCallback, useState } from 'react';

import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  refreshGoogleCalendarCache,
  updateGoogleCalendarEvent,
  type CalendarEntry,
  type GoogleCalendarEvent,
  type GoogleEventInput,
} from '@features/calendar/api/calendar';
import { createTask, scheduleTask } from '@features/tasks/api/tasks';
import { NORDLY_EVENTS } from '@shared/lib/custom-events';

export type CalendarEditorState =
  | { mode: 'create'; kind: 'google' | 'task'; start: Date; end: Date; title: string }
  | { mode: 'edit'; entry: CalendarEntry; title: string };

export interface CalendarEditorDependencies {
  createTask: (title: string) => Promise<{ id: string }>;
  scheduleTask: (taskId: string, start: Date, durationMin: number) => Promise<unknown>;
  notifyTasksChanged: () => void;
  refreshTasks: () => Promise<void>;
  createGoogleEvent: (input: GoogleEventInput) => Promise<GoogleCalendarEvent>;
  updateGoogleEvent: (
    eventId: string,
    input: GoogleEventInput,
  ) => Promise<GoogleCalendarEvent>;
  deleteGoogleEvent: (eventId: string, calendarId?: string) => Promise<void>;
  refreshGoogleCache: () => Promise<unknown>;
  onCommitted: () => void;
}

export async function submitCalendarEditor(
  editor: CalendarEditorState,
  dependencies: CalendarEditorDependencies,
): Promise<'task' | 'google' | null> {
  const title = editor.title.trim();
  if (!title) return null;

  if (editor.mode === 'create' && editor.kind === 'task') {
    const durationMin = Math.max(
      15,
      Math.round((editor.end.getTime() - editor.start.getTime()) / 60_000),
    );
    const task = await dependencies.createTask(title);
    await dependencies.scheduleTask(task.id, editor.start, durationMin);
    dependencies.notifyTasksChanged();
    dependencies.onCommitted();
    await dependencies.refreshTasks();
    return 'task';
  }

  if (editor.mode === 'create') {
    await dependencies.createGoogleEvent({
      title,
      start: editor.start,
      end: editor.end,
      allDay: false,
    });
    dependencies.onCommitted();
    await dependencies.refreshGoogleCache();
    return 'google';
  }

  if (!editor.entry.googleEventId) return null;
  await dependencies.updateGoogleEvent(editor.entry.googleEventId, {
    title,
    start: editor.entry.start,
    end: editor.entry.end,
    allDay: editor.entry.allDay,
    calendarId: editor.entry.googleCalendarId,
  });
  dependencies.onCommitted();
  await dependencies.refreshGoogleCache();
  return 'google';
}

export async function deleteCalendarEditorEvent(
  editor: CalendarEditorState,
  dependencies: CalendarEditorDependencies,
): Promise<boolean> {
  if (editor.mode !== 'edit' || !editor.entry.googleEventId) return false;
  await dependencies.deleteGoogleEvent(
    editor.entry.googleEventId,
    editor.entry.googleCalendarId,
  );
  dependencies.onCommitted();
  await dependencies.refreshGoogleCache();
  return true;
}

interface UseCalendarEditorOptions {
  refreshTasks: () => Promise<void>;
  onError: (error: unknown) => void;
  onGoogleError: (error: unknown) => void;
}

export function useCalendarEditor({
  refreshTasks,
  onError,
  onGoogleError,
}: UseCalendarEditorOptions): {
  editor: CalendarEditorState | null;
  saving: boolean;
  openEntry: (entry: CalendarEntry) => void;
  openTaskRange: (start: Date, end: Date) => void;
  setTitle: (title: string) => void;
  close: () => void;
  save: () => Promise<void>;
  deleteEvent: () => Promise<void>;
} {
  const [editor, setEditor] = useState<CalendarEditorState | null>(null);
  const [saving, setSaving] = useState(false);

  const dependencies = useCallback(
    (): CalendarEditorDependencies => ({
      createTask: (title) => createTask({ title }),
      scheduleTask,
      notifyTasksChanged: () =>
        window.dispatchEvent(new CustomEvent(NORDLY_EVENTS.tasksChanged)),
      refreshTasks,
      createGoogleEvent: createGoogleCalendarEvent,
      updateGoogleEvent: updateGoogleCalendarEvent,
      deleteGoogleEvent: deleteGoogleCalendarEvent,
      refreshGoogleCache: refreshGoogleCalendarCache,
      onCommitted: () => setEditor(null),
    }),
    [refreshTasks],
  );

  const save = useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    try {
      await submitCalendarEditor(editor, dependencies());
    } catch (error) {
      if (editor.mode === 'create' && editor.kind === 'task') onError(error);
      else onGoogleError(error);
    } finally {
      setSaving(false);
    }
  }, [dependencies, editor, onError, onGoogleError]);

  const deleteEvent = useCallback(async () => {
    if (!editor) return;
    setSaving(true);
    try {
      await deleteCalendarEditorEvent(editor, dependencies());
    } catch (error) {
      onGoogleError(error);
    } finally {
      setSaving(false);
    }
  }, [dependencies, editor, onGoogleError]);

  return {
    editor,
    saving,
    openEntry: (entry) => setEditor({ mode: 'edit', entry, title: entry.title }),
    openTaskRange: (start, end) =>
      setEditor({ mode: 'create', kind: 'task', start, end, title: '' }),
    setTitle: (title) => setEditor((current) => (current ? { ...current, title } : current)),
    close: () => setEditor(null),
    save,
    deleteEvent,
  };
}
