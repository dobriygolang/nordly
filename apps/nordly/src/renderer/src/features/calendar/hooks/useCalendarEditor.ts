import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  type GoogleCalendarEvent,
  type GoogleEventInput,
} from '@features/calendar/api/calendarClient';
import type { CalendarEntry } from '@features/calendar/lib/events';
import { refreshGoogleCalendarCache } from '@features/calendar/lib/googleCalendarSyncWorker';
import { createScheduledTask } from '@features/tasks/api/tasks';
import { CalendarEditorKind, CalendarEditorMode } from '@features/calendar/model/editor';

export type CalendarEditorState =
  | { mode: typeof CalendarEditorMode.Create; kind: CalendarEditorKind; start: Date; end: Date; title: string }
  | { mode: typeof CalendarEditorMode.Edit; entry: CalendarEntry; title: string };

export interface CalendarEditorDependencies {
  createScheduledTask: (
    title: string,
    start: Date,
    durationMin: number,
  ) => Promise<unknown>;
  refreshTasks: () => Promise<void>;
  createGoogleEvent: (input: GoogleEventInput) => Promise<GoogleCalendarEvent>;
  updateGoogleEvent: (
    eventId: string,
    input: GoogleEventInput,
  ) => Promise<GoogleCalendarEvent>;
  deleteGoogleEvent: (eventId: string, calendarId: string) => Promise<void>;
  refreshGoogleCache: () => Promise<unknown>;
  onCommitted: () => void;
}

export async function submitCalendarEditor(
  editor: CalendarEditorState,
  dependencies: CalendarEditorDependencies,
): Promise<CalendarEditorKind | null> {
  const title = editor.title.trim();
  if (!title) return null;

  if (editor.mode === CalendarEditorMode.Create && editor.kind === CalendarEditorKind.Task) {
    const durationMin = Math.max(
      15,
      Math.round((editor.end.getTime() - editor.start.getTime()) / 60_000),
    );
    await dependencies.createScheduledTask(title, editor.start, durationMin);
    dependencies.onCommitted();
    await dependencies.refreshTasks();
    return CalendarEditorKind.Task;
  }

  if (editor.mode === CalendarEditorMode.Create) {
    await dependencies.createGoogleEvent({
      title,
      start: editor.start,
      end: editor.end,
      allDay: false,
    });
    dependencies.onCommitted();
    await dependencies.refreshGoogleCache();
    return CalendarEditorKind.Google;
  }

  if (!editor.entry.googleEventId || !editor.entry.googleCalendarId) {
    throw new Error('Google event is missing calendarId');
  }
  await dependencies.updateGoogleEvent(editor.entry.googleEventId, {
    title,
    start: editor.entry.start,
    end: editor.entry.end,
    allDay: editor.entry.allDay,
    calendarId: editor.entry.googleCalendarId,
  });
  dependencies.onCommitted();
  await dependencies.refreshGoogleCache();
  return CalendarEditorKind.Google;
}

export async function deleteCalendarEditorEvent(
  editor: CalendarEditorState,
  dependencies: CalendarEditorDependencies,
): Promise<boolean> {
  if (editor.mode !== CalendarEditorMode.Edit || !editor.entry.googleEventId) return false;
  if (!editor.entry.googleCalendarId) {
    throw new Error('Google event is missing calendarId');
  }
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
  save: () => Promise<boolean>;
  flushDirtyEdit: () => Promise<boolean>;
  deleteEvent: () => Promise<void>;
} {
  const [editor, setEditor] = useState<CalendarEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const dependencies = useCallback(
    (): CalendarEditorDependencies => ({
      createScheduledTask: (title, start, durationMin) =>
        createScheduledTask({ title, start, durationMin }),
      refreshTasks,
      createGoogleEvent: createGoogleCalendarEvent,
      updateGoogleEvent: updateGoogleCalendarEvent,
      deleteGoogleEvent: deleteGoogleCalendarEvent,
      refreshGoogleCache: refreshGoogleCalendarCache,
      onCommitted: () => {
        if (mountedRef.current) setEditor(null);
      },
    }),
    [refreshTasks],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!editor) return true;
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      await submitCalendarEditor(editor, dependencies());
      return true;
    } catch (error) {
      if (editor.mode === CalendarEditorMode.Create && editor.kind === CalendarEditorKind.Task) onError(error);
      else onGoogleError(error);
      return false;
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [dependencies, editor, onError, onGoogleError]);

  const flushDirtyEdit = useCallback(async (): Promise<boolean> => {
    if (!editor) return true;
    if (editor.mode !== CalendarEditorMode.Edit) return true;
    const next = editor.title.trim();
    const prev = editor.entry.title.trim();
    if (!next || next === prev) return true;
    return save();
  }, [editor, save]);

  const deleteEvent = useCallback(async () => {
    if (!editor) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await deleteCalendarEditorEvent(editor, dependencies());
    } catch (error) {
      onGoogleError(error);
    } finally {
      savingRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  }, [dependencies, editor, onGoogleError]);

  return {
    editor,
    saving,
    openEntry: (entry) => setEditor({ mode: CalendarEditorMode.Edit, entry, title: entry.title }),
    openTaskRange: (start, end) =>
      setEditor({ mode: CalendarEditorMode.Create, kind: CalendarEditorKind.Task, start, end, title: '' }),
    setTitle: (title) => setEditor((current) => (current ? { ...current, title } : current)),
    close: () => {
      if (!savingRef.current) setEditor(null);
    },
    save,
    flushDirtyEdit,
    deleteEvent,
  };
}
