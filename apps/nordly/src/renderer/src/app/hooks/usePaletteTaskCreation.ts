import { useCallback } from 'react';

interface UsePaletteTaskCreationOptions {
  closePalette: () => void;
  onError: (error: unknown) => void;
}

export function usePaletteTaskCreation({
  closePalette,
  onError,
}: UsePaletteTaskCreationOptions): (title: string, date: Date) => Promise<void> {
  return useCallback(
    async (title: string, date: Date): Promise<void> => {
      closePalette();
      try {
        const [
          { createScheduledTask, listTasks },
          { TASK_DURATION_DEFAULT },
          { resolveScheduleStart, toDayKey },
        ] = await Promise.all([
          import('@features/tasks/api/tasks'),
          import('@features/tasks/model/duration'),
          import('@shared/lib/dates'),
        ]);
        const existing = await listTasks();
        const start = resolveScheduleStart(toDayKey(date), existing, date);
        await createScheduledTask({
          title,
          start,
          durationMin: TASK_DURATION_DEFAULT,
        });
      } catch (error) {
        onError(error);
      }
    },
    [closePalette, onError],
  );
}
